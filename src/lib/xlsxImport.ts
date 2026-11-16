import "server-only";
import ExcelJS from "exceljs";

/** One parsed row: the hidden Record ID from column A, plus every other column keyed by its header text. */
export type ParsedImportRow = {
  id: string;
  cells: Record<string, string | number | Date | null>;
};

/**
 * Reads back a workbook built by buildExportSheet (xlsxExport.ts) — column A
 * is the hidden Record ID, row 1 is headers, matched by text rather than
 * position so an export with fewer columns (e.g. cost price hidden from a
 * non-Owner export) still imports correctly.
 */
export async function parseImportSheet(buffer: Buffer): Promise<ParsedImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: ParsedImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rawId = row.getCell(1).value;
    const id = rawId == null ? "" : String(rawId).trim();
    if (!id) return;

    const cells: Record<string, string | number | Date | null> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header || colNumber === 1) return;
      cells[header] = normalizeCellValue(cell.value);
    });
    rows.push({ id, cells });
  });
  return rows;
}

function normalizeCellValue(value: ExcelJS.CellValue): string | number | Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "result" in value) return normalizeCellValue(value.result ?? null);
  if (typeof value === "object" && "text" in value) return String(value.text ?? "");
  if (typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

type Cell = string | number | Date | null;

export function parseTextCell(cell: Cell): { value: string } | { error: string } {
  const s = String(cell).trim();
  return s ? { value: s } : { error: "Can't be blank" };
}

export function parseEmailCell(cell: Cell): { value: string } | { error: string } {
  const s = String(cell).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return { error: "Not a valid email address" };
  return { value: s };
}

export function parseDateCell(cell: Cell): { value: Date } | { error: string } {
  const d = cell instanceof Date ? cell : new Date(String(cell));
  if (Number.isNaN(d.getTime())) return { error: "Not a valid date" };
  return { value: d };
}

export function parseNumberCell(cell: Cell, opts?: { min?: number; integer?: boolean }): { value: number } | { error: string } {
  const n = typeof cell === "number" ? cell : Number(String(cell).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n)) return { error: "Not a number" };
  if (opts?.integer && !Number.isInteger(n)) return { error: "Must be a whole number" };
  if (opts?.min !== undefined && n < opts.min) return { error: `Must be at least ${opts.min}` };
  return { value: n };
}

export function parseEnumCell<T extends string>(cell: Cell, options: readonly T[]): { value: T } | { error: string } {
  const s = String(cell).trim().toUpperCase().replace(/\s+/g, "_");
  const match = options.find((o) => o === s);
  if (!match) return { error: `Must be one of: ${options.join(", ")}` };
  return { value: match };
}

export function dateEqual(a: unknown, b: unknown) {
  const toDay = (v: unknown) => (v ? new Date(v as string | Date).toDateString() : null);
  return toDay(a) === toDay(b);
}

export function numberEqual(a: unknown, b: unknown) {
  const round = (v: unknown) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);
  return round(a) === round(b);
}

export type FieldChange = { field: string; label: string; from: string; to: string };

/**
 * One importable field's mapping: how to read it back out of a parsed cell
 * (and validate/coerce it), and how to format a value for the diff display.
 */
export type ImportFieldDef<T> = {
  header: string;
  dbField: string;
  /** Parses the raw cell value into the shape Prisma expects, or returns an error string if invalid. */
  parse: (cell: string | number | Date | null) => { value: unknown } | { error: string };
  /** Reads the current value off the live record, for comparison. */
  current: (record: T) => unknown;
  /** Formats a value (either side of the diff) for display. */
  display: (value: unknown) => string;
  /** True if two values should be treated as equal (default: loose equality after formatting). */
  equal?: (a: unknown, b: unknown) => boolean;
};

export type DiffRow = {
  id: string;
  label: string;
  changes: FieldChange[];
  errors: string[];
  payload: Record<string, unknown>;
};

/** Compares a parsed sheet against live records (keyed by id) using the given field defs, building one DiffRow per matched row. */
export function buildDiff<T>(
  parsedRows: ParsedImportRow[],
  recordsById: Map<string, T>,
  fields: ImportFieldDef<T>[],
  labelOf: (record: T) => string,
): DiffRow[] {
  const diffRows: DiffRow[] = [];
  for (const row of parsedRows) {
    const record = recordsById.get(row.id);
    if (!record) {
      diffRows.push({ id: row.id, label: `(not found: ${row.id})`, changes: [], errors: ["Record no longer exists — skipped."], payload: {} });
      continue;
    }
    const changes: FieldChange[] = [];
    const errors: string[] = [];
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      const cell = row.cells[field.header];
      if (cell === undefined || cell === null || cell === "") continue; // blank cell = no change requested
      const parsed = field.parse(cell);
      if ("error" in parsed) {
        errors.push(`${field.header}: ${parsed.error}`);
        continue;
      }
      const currentValue = field.current(record);
      const isEqual = field.equal ? field.equal(currentValue, parsed.value) : field.display(currentValue) === field.display(parsed.value);
      if (!isEqual) {
        changes.push({ field: field.dbField, label: field.header, from: field.display(currentValue), to: field.display(parsed.value) });
        // Dates are serialized to ISO strings — the payload is stored as JSON on ImportBatch/EditRequest, which can't hold a Date instance.
        payload[field.dbField] = parsed.value instanceof Date ? parsed.value.toISOString() : parsed.value;
      }
    }
    if (changes.length > 0 || errors.length > 0) {
      diffRows.push({ id: row.id, label: labelOf(record), changes, errors, payload });
    }
  }
  return diffRows;
}
