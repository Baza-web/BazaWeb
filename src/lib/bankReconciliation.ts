import "server-only";
import { round2 } from "./utils";
import { fileToMatrix, findHeaderIndex, toNumber, toDate } from "./importParsing";

export type ParsedBankLine = { date: Date; description: string; amount: number };

const DATE_HEADERS = ["date", "transaction date", "value date", "posting date"];
const DESCRIPTION_HEADERS = ["description", "narration", "details", "particulars", "memo"];
const AMOUNT_HEADERS = ["amount", "transaction amount"];
const DEBIT_HEADERS = ["debit", "withdrawal", "money out", "paid out"];
const CREDIT_HEADERS = ["credit", "deposit", "money in", "paid in"];

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
  const matrix = await fileToMatrix(buffer, filename);
  if (matrix.length === 0) return { rows: [], error: "The file has no rows." };
  return rowsFromMatrix(matrix);
}
