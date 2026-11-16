import "server-only";
import ExcelJS from "exceljs";
import { round2 } from "./utils";

export type ParsedBankLine = { date: Date; description: string; amount: number };

const DATE_HEADERS = ["date", "transaction date", "value date", "posting date"];
const DESCRIPTION_HEADERS = ["description", "narration", "details", "particulars", "memo"];
const AMOUNT_HEADERS = ["amount", "transaction amount"];
const DEBIT_HEADERS = ["debit", "withdrawal", "money out", "paid out"];
const CREDIT_HEADERS = ["credit", "deposit", "money in", "paid in"];

function findHeaderIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

function toNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A statement's columns vary bank to bank. This accepts either a single
 * signed "Amount" column, or separate "Debit"/"Credit" columns (both
 * positive, convention: debit = money out, credit = money in) — whichever
 * the file actually has — and always returns a single signed amount from
 * the bank's own point of view (positive = money in).
 */
function rowsFromMatrix(matrix: unknown[][]): { rows: ParsedBankLine[]; error?: string } {
  if (matrix.length === 0) return { rows: [], error: "The file is empty." };
  const headers = matrix[0].map((h) => String(h ?? ""));
  const dateIdx = findHeaderIndex(headers, DATE_HEADERS);
  const descIdx = findHeaderIndex(headers, DESCRIPTION_HEADERS);
  const amountIdx = findHeaderIndex(headers, AMOUNT_HEADERS);
  const debitIdx = findHeaderIndex(headers, DEBIT_HEADERS);
  const creditIdx = findHeaderIndex(headers, CREDIT_HEADERS);

  if (dateIdx === -1 || descIdx === -1 || (amountIdx === -1 && debitIdx === -1 && creditIdx === -1)) {
    return {
      rows: [],
      error:
        "Couldn't find the expected columns — need a Date column, a Description column, and either an Amount column or Debit/Credit columns.",
    };
  }

  const rows: ParsedBankLine[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((c) => c == null || c === "")) continue;
    const date = toDate(row[dateIdx]);
    const description = String(row[descIdx] ?? "").trim();
    if (!date || !description) continue;
    const amount =
      amountIdx !== -1 ? round2(toNumber(row[amountIdx])) : round2(toNumber(row[creditIdx]) - toNumber(row[debitIdx]));
    if (amount === 0) continue;
    rows.push({ date, description, amount });
  }
  return { rows };
}

export async function parseBankStatementFile(buffer: Buffer, filename: string): Promise<{ rows: ParsedBankLine[]; error?: string }> {
  const isCsv = filename.toLowerCase().endsWith(".csv") || (!filename.toLowerCase().endsWith(".xlsx") && looksLikeCsv(buffer));

  if (isCsv) {
    const text = buffer.toString("utf8");
    const matrix = parseCsv(text);
    return rowsFromMatrix(matrix);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], error: "The file has no sheets." };

  const matrix: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const v = cell.value;
      cells[colNumber - 1] = v instanceof Date ? v : typeof v === "object" && v && "result" in v ? (v as { result: unknown }).result : v;
    });
    matrix.push(cells);
  });
  return rowsFromMatrix(matrix);
}

function looksLikeCsv(buffer: Buffer): boolean {
  // An .xlsx file is a zip archive — its first two bytes are "PK". Anything else, treat as text/CSV.
  return !(buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4b);
}

function parseCsv(text: string): string[][] {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  });
}
