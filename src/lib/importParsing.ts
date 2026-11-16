import "server-only";
import ExcelJS from "exceljs";

/** Shared by every "upload a spreadsheet" feature (Bank Reconciliation, Historical Accounting Import, and anything future) — parses a .xlsx or .csv file into a plain row/column matrix, so each feature only has to write its own header-matching logic. */
export async function fileToMatrix(buffer: Buffer, filename: string): Promise<unknown[][]> {
  const isCsv = filename.toLowerCase().endsWith(".csv") || (!filename.toLowerCase().endsWith(".xlsx") && looksLikeCsv(buffer));
  if (isCsv) return parseCsv(buffer.toString("utf8"));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const matrix: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const v = cell.value;
      cells[colNumber - 1] = v instanceof Date ? v : typeof v === "object" && v && "result" in v ? (v as { result: unknown }).result : v;
    });
    matrix.push(cells);
  });
  return matrix;
}

export function findHeaderIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

export function toNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
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
