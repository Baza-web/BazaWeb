import "server-only";
import { db } from "./db";
import type { SessionPayload } from "./auth";
import { round2 } from "./utils";
import { postJournalEntry, seedDefaultAccounts, type JournalLineInput } from "./ledger";
import { fileToMatrix, findHeaderIndex, toNumber } from "./importParsing";

const MONTH_HEADERS = ["month", "period", "month/year"];
const ACCOUNT_CODE_HEADERS = ["account code", "code", "account no", "account number"];
const ACCOUNT_NAME_HEADERS = ["account", "account name", "name"];
const DEBIT_HEADERS = ["debit", "dr"];
const CREDIT_HEADERS = ["credit", "cr"];

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

type RawRow = { monthKey: string; monthLabel: string; accountCode: string; accountName: string; debit: number; credit: number; rowNum: number };

/** Accepts "2026-01", "2026/01", "01/2026", "Jan 2026", "January 2026", "Jan-2026" — anything else is rejected per-row rather than guessed at. */
function parseMonth(raw: unknown): { key: string; label: string } | null {
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = raw.getMonth() + 1;
    return { key: `${y}-${String(m).padStart(2, "0")}`, label: monthLabel(y, m) };
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return monthFrom(Number(m[1]), Number(m[2]));

  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return monthFrom(Number(m[2]), Number(m[1]));

  m = s.match(/^([a-zA-Z]+)[\s-]+(\d{4})$/);
  if (m) {
    const idx = MONTH_NAMES.indexOf(m[1].toLowerCase());
    if (idx !== -1) return monthFrom(Number(m[2]), idx + 1);
  }
  m = s.match(/^(\d{4})[\s-]+([a-zA-Z]+)$/);
  if (m) {
    const idx = MONTH_NAMES.indexOf(m[2].toLowerCase());
    if (idx !== -1) return monthFrom(Number(m[1]), idx + 1);
  }
  return null;
}

function monthFrom(year: number, month: number): { key: string; label: string } | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 1900 || year > 2200) return null;
  return { key: `${year}-${String(month).padStart(2, "0")}`, label: monthLabel(year, month) };
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1][0].toUpperCase()}${MONTH_NAMES[month - 1].slice(1)} ${year}`;
}

function lastDayOfMonth(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function parseHistoricalTotalsFile(buffer: Buffer, filename: string): Promise<{ rows: RawRow[]; error?: string }> {
  const matrix = await fileToMatrix(buffer, filename);
  if (matrix.length === 0) return { rows: [], error: "The file has no rows." };

  const headers = matrix[0].map((h) => String(h ?? ""));
  const monthIdx = findHeaderIndex(headers, MONTH_HEADERS);
  const codeIdx = findHeaderIndex(headers, ACCOUNT_CODE_HEADERS);
  const nameIdx = findHeaderIndex(headers, ACCOUNT_NAME_HEADERS);
  const debitIdx = findHeaderIndex(headers, DEBIT_HEADERS);
  const creditIdx = findHeaderIndex(headers, CREDIT_HEADERS);

  if (monthIdx === -1 || (codeIdx === -1 && nameIdx === -1) || (debitIdx === -1 && creditIdx === -1)) {
    return {
      rows: [],
      error:
        "Couldn't find the expected columns — need a Month column, an Account code or Account name column, and a Debit and/or Credit column.",
    };
  }

  const rows: RawRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((c) => c == null || c === "")) continue;
    const month = parseMonth(row[monthIdx]);
    if (!month) continue;
    const debit = debitIdx !== -1 ? round2(toNumber(row[debitIdx])) : 0;
    const credit = creditIdx !== -1 ? round2(toNumber(row[creditIdx])) : 0;
    if (debit === 0 && credit === 0) continue;
    rows.push({
      monthKey: month.key, monthLabel: month.label,
      accountCode: codeIdx !== -1 ? String(row[codeIdx] ?? "").trim() : "",
      accountName: nameIdx !== -1 ? String(row[nameIdx] ?? "").trim() : "",
      debit, credit, rowNum: i + 1,
    });
  }
  return { rows };
}

export type HistoricalImportResult = {
  monthsPosted: { monthKey: string; monthLabel: string; entryNumber: string }[];
  monthsSkipped: { monthKey: string; monthLabel: string; reason: string }[];
  rowErrors: string[];
};

/**
 * Posts one balanced journal entry per month (dated the last day of that
 * month), tagged with reference "HIST-<month>" so a month already imported
 * is refused rather than double-posted — reverse that entry from Journal
 * Entries first if a month needs redoing. Rows whose account can't be
 * resolved are skipped with a clear error rather than failing the whole
 * import; if a month's resolved rows don't balance on their own (common
 * when the source only has partial detail), the difference posts to
 * "Historical Data Suspense" for the accountant to review and reclassify.
 */
export async function importHistoricalTotals(session: SessionPayload, branchId: string | null, rows: RawRow[]): Promise<HistoricalImportResult> {
  await seedDefaultAccounts(); // idempotent — picks up "3300 Historical Data Suspense" on an install seeded before it existed
  const accounts = await db.account.findMany();
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const byName = new Map(accounts.map((a) => [a.name.toLowerCase(), a]));
  const suspenseAccount = byCode.get("3300");

  const byMonth = new Map<string, RawRow[]>();
  for (const r of rows) {
    if (!byMonth.has(r.monthKey)) byMonth.set(r.monthKey, []);
    byMonth.get(r.monthKey)!.push(r);
  }

  const result: HistoricalImportResult = { monthsPosted: [], monthsSkipped: [], rowErrors: [] };
  const monthKeys = [...byMonth.keys()].sort();

  for (const monthKey of monthKeys) {
    const monthRows = byMonth.get(monthKey)!;
    const monthLabel = monthRows[0].monthLabel;

    const already = await db.journalEntry.findFirst({ where: { reference: `HIST-${monthKey}` } });
    if (already) {
      result.monthsSkipped.push({ monthKey, monthLabel, reason: `Already imported as ${already.entryNumber}` });
      continue;
    }

    const lines: JournalLineInput[] = [];
    for (const r of monthRows) {
      const account = (r.accountCode && byCode.get(r.accountCode)) || (r.accountName && byName.get(r.accountName.toLowerCase()));
      if (!account) {
        result.rowErrors.push(`Row ${r.rowNum} (${monthLabel}): account "${r.accountCode || r.accountName}" not found — skipped.`);
        continue;
      }
      if (r.debit > 0) lines.push({ accountId: account.id, debit: r.debit, credit: 0 });
      if (r.credit > 0) lines.push({ accountId: account.id, debit: 0, credit: r.credit });
    }

    if (lines.length === 0) {
      result.monthsSkipped.push({ monthKey, monthLabel, reason: "No resolvable lines — nothing to post." });
      continue;
    }

    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    const diff = round2(totalDebit - totalCredit);
    if (diff !== 0) {
      if (!suspenseAccount) {
        result.monthsSkipped.push({ monthKey, monthLabel, reason: "Rows don't balance and no Historical Data Suspense account exists — seed the Chart of Accounts first." });
        continue;
      }
      if (diff > 0) lines.push({ accountId: suspenseAccount.id, debit: 0, credit: diff });
      else lines.push({ accountId: suspenseAccount.id, debit: -diff, credit: 0 });
    }

    const entry = await postJournalEntry(session, {
      date: lastDayOfMonth(monthKey),
      description: `Historical totals — ${monthLabel}`,
      reference: `HIST-${monthKey}`,
      branchId: branchId ?? undefined,
      lines,
    });
    result.monthsPosted.push({ monthKey, monthLabel, entryNumber: entry.entryNumber });
  }

  return result;
}
