import "server-only";
import { db } from "./db";
import type { SessionPayload } from "./auth";
import { round2 } from "./utils";
import type { AccountType } from "@prisma/client";

/**
 * Chart of Accounts defaults, per the business's requested account
 * structure. Seeded once (see seedDefaultAccounts) — idempotent, never
 * overwrites or duplicates an account that already exists by code.
 */
export const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  // Assets
  { code: "1000", name: "Cash", type: "ASSET" },
  { code: "1010", name: "Bank", type: "ASSET" },
  { code: "1020", name: "Petty Cash", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  { code: "1200", name: "Inventory", type: "ASSET" },
  { code: "1500", name: "Fixed Assets", type: "ASSET" },
  { code: "1900", name: "Other Assets", type: "ASSET" },
  // Liabilities
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2100", name: "Customer Advances", type: "LIABILITY" },
  { code: "2200", name: "Outstanding Salaries", type: "LIABILITY" },
  { code: "2900", name: "Other Liabilities", type: "LIABILITY" },
  // Equity
  { code: "3000", name: "Owner's Capital", type: "EQUITY" },
  { code: "3100", name: "Retained Earnings", type: "EQUITY" },
  { code: "3200", name: "Current Year Earnings", type: "EQUITY" },
  // Income
  { code: "4000", name: "Jewelry Sales", type: "INCOME" },
  { code: "4010", name: "Gemstone Sales", type: "INCOME" },
  { code: "4020", name: "Custom Orders", type: "INCOME" },
  { code: "4030", name: "Workshop Income", type: "INCOME" },
  { code: "4900", name: "Other Income", type: "INCOME" },
  // Expenses
  { code: "5000", name: "Salaries", type: "EXPENSE" },
  { code: "5010", name: "Rent", type: "EXPENSE" },
  { code: "5020", name: "Marketing", type: "EXPENSE" },
  { code: "5030", name: "Transportation", type: "EXPENSE" },
  { code: "5040", name: "Utilities", type: "EXPENSE" },
  { code: "5050", name: "Packaging", type: "EXPENSE" },
  { code: "5060", name: "Administration", type: "EXPENSE" },
  { code: "5070", name: "Workshop Expenses", type: "EXPENSE" },
  { code: "5080", name: "Bank Charges", type: "EXPENSE" },
  { code: "5900", name: "Other Expenses", type: "EXPENSE" },
];

/** Idempotent — only inserts accounts whose code doesn't already exist. Safe to call repeatedly; never overwrites or duplicates. */
export async function seedDefaultAccounts() {
  const existing = await db.account.findMany({ select: { code: true } });
  const existingCodes = new Set(existing.map((a) => a.code));
  const toCreate = DEFAULT_ACCOUNTS.filter((a) => !existingCodes.has(a.code));
  if (toCreate.length === 0) return { created: 0 };
  await db.account.createMany({ data: toCreate.map((a) => ({ ...a, isSystem: true })) });
  return { created: toCreate.length };
}

async function nextEntryNumber(): Promise<string> {
  const count = await db.journalEntry.count();
  return `JE-${String(count + 1).padStart(6, "0")}`;
}

export type JournalLineInput = { accountId: string; debit: number; credit: number };

/**
 * Posts a balanced double-entry journal entry. Rejects anything where
 * total debits don't exactly equal total credits (to the cent), or
 * where a line has both a debit and a credit, or neither. Every line's
 * amount is rounded to 2 decimals first (decimal-safe: compares rounded
 * cents, not raw floats) so near-equal floating point sums can't slip
 * through as "balanced".
 */
export async function postJournalEntry(
  session: SessionPayload,
  input: {
    date: Date;
    description: string;
    reference?: string;
    branchId?: string | null;
    department?: string | null;
    lines: JournalLineInput[];
  },
) {
  const lines = input.lines.map((l) => ({
    accountId: l.accountId,
    debit: round2(l.debit || 0),
    credit: round2(l.credit || 0),
  }));

  if (lines.length < 2) throw new Error("A journal entry needs at least two lines.");
  for (const line of lines) {
    if (line.debit > 0 && line.credit > 0) throw new Error("A line can't have both a debit and a credit.");
    if (line.debit === 0 && line.credit === 0) throw new Error("Every line needs either a debit or a credit amount.");
    if (line.debit < 0 || line.credit < 0) throw new Error("Amounts can't be negative.");
  }

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (totalDebit !== totalCredit) {
    throw new Error(`Entry is unbalanced: total debits (${totalDebit}) must equal total credits (${totalCredit}).`);
  }
  if (totalDebit === 0) throw new Error("Entry has no amount.");

  const entryNumber = await nextEntryNumber();
  return db.journalEntry.create({
    data: {
      entryNumber,
      date: input.date,
      description: input.description,
      reference: input.reference || null,
      branchId: input.branchId || null,
      department: input.department || null,
      createdById: session.staffId,
      lines: { create: lines },
    },
    include: { lines: { include: { account: true } } },
  });
}

/** Corrections happen via a reversal, never by editing or deleting a posted entry. Creates a new balanced entry with every line's debit/credit flipped. */
export async function reverseJournalEntry(session: SessionPayload, entryId: string) {
  const original = await db.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: true } });
  if (original.reversalOfId) throw new Error("A reversal entry can't itself be reversed.");
  const existingReversal = await db.journalEntry.findFirst({ where: { reversalOfId: entryId } });
  if (existingReversal) throw new Error("This entry has already been reversed.");

  const entryNumber = await nextEntryNumber();
  return db.journalEntry.create({
    data: {
      entryNumber,
      date: new Date(),
      description: `Reversal of ${original.entryNumber}: ${original.description}`,
      reference: original.reference,
      branchId: original.branchId,
      department: original.department,
      createdById: session.staffId,
      reversalOfId: original.id,
      lines: {
        create: original.lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit })),
      },
    },
    include: { lines: { include: { account: true } } },
  });
}
