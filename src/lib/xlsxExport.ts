import "server-only";
import ExcelJS from "exceljs";

export type ExportColumn<T> = {
  header: string;
  width?: number;
  value: (row: T) => string | number | Date | null | undefined;
  format?: "money" | "date" | "datetime";
};

/**
 * Builds a single-sheet .xlsx workbook from plain row objects. Column A is
 * always the record's id (hidden, not in `columns`) when `idOf` is given —
 * the bulk-import step matches rows back to real records by this id, so an
 * exported sheet can be edited and re-imported without losing the link.
 */
export async function buildExportSheet<T>(
  sheetTitle: string,
  columns: ExportColumn<T>[],
  rows: T[],
  idOf?: (row: T) => string,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Baza Boutique";
  workbook.created = new Date();
  addSheet(workbook, sheetTitle, columns, rows, idOf);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Same as buildExportSheet, but for a workbook with multiple named sheets. */
export async function buildExportWorkbook(
  sheets: { title: string; columns: ExportColumn<unknown>[]; rows: unknown[]; idOf?: (row: unknown) => string }[],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Baza Boutique";
  workbook.created = new Date();
  for (const s of sheets) addSheet(workbook, s.title, s.columns, s.rows, s.idOf);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function addSheet<T>(
  workbook: ExcelJS.Workbook,
  sheetTitle: string,
  columns: ExportColumn<T>[],
  rows: T[],
  idOf?: (row: T) => string,
) {
  const sheet = workbook.addWorksheet(sheetTitle.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  const font = { name: "Arial" };
  const headers = idOf ? ["Record ID", ...columns.map((c) => c.header)] : columns.map((c) => c.header);
  sheet.columns = headers.map((header, i) => ({
    header,
    width: idOf && i === 0 ? 12 : (idOf ? columns[i - 1]?.width : columns[i]?.width) ?? 18,
  }));
  if (idOf) sheet.getColumn(1).hidden = true;

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { ...font, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC9801F" } };
    cell.alignment = { vertical: "middle" };
  });

  for (const row of rows) {
    const values = columns.map((c) => {
      const v = c.value(row);
      return v ?? "";
    });
    const r = sheet.addRow(idOf ? [idOf(row), ...values] : values);
    r.eachCell((cell, colNumber) => {
      cell.font = font;
      const col = idOf ? columns[colNumber - 2] : columns[colNumber - 1];
      if (!col) return;
      if (col.format === "money") cell.numFmt = '"LKR" #,##0.00';
      if (col.format === "date") cell.numFmt = "yyyy-mm-dd";
      if (col.format === "datetime") cell.numFmt = "yyyy-mm-dd hh:mm";
    });
  }
}

export function xlsxResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}

export function timestampedFilename(base: string, extension = "xlsx") {
  const d = new Date().toISOString().slice(0, 10);
  return `${base}-${d}.${extension}`;
}
