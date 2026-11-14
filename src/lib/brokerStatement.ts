import "server-only";
import ExcelJS from "exceljs";
import { formatMoney, formatDate } from "./utils";

type StatementRow = {
  memoNumber: string;
  issuedAt: Date;
  sku: string;
  itemName: string;
  category: string;
  quantity: number;
  returnedQuantity: number;
  valueEach: number;
};

/**
 * Builds an .xlsx statement for one broker listing only the stones issued
 * to them — every memo item, with quantity taken, quantity returned, and
 * what's still outstanding. Emailed to the broker after every memo change.
 */
export async function generateBrokerStatementXlsx(brokerName: string, rows: StatementRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Baza ERP";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Statement", { views: [{ state: "frozen", ySplit: 4 }] });
  const font = { name: "Arial" };

  sheet.getCell("A1").value = `Memo statement — ${brokerName}`;
  sheet.getCell("A1").font = { ...font, size: 14, bold: true };
  sheet.getCell("A2").value = `Generated ${formatDate(new Date())}`;
  sheet.getCell("A2").font = { ...font, size: 10, color: { argb: "FF666666" } };

  const headerRow = sheet.getRow(4);
  const headers = [
    "Memo #",
    "Date issued",
    "SKU",
    "Item",
    "Category",
    "Qty taken",
    "Qty returned",
    "Qty outstanding",
    "Value each",
    "Outstanding value",
  ];
  headerRow.values = headers;
  headerRow.eachCell((cell) => {
    cell.font = { ...font, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC9801F" } };
    cell.alignment = { vertical: "middle" };
  });

  let totalOutstandingValue = 0;
  rows.forEach((row, i) => {
    const outstanding = row.quantity - row.returnedQuantity;
    const outstandingValue = outstanding * row.valueEach;
    totalOutstandingValue += outstandingValue;

    const r = sheet.getRow(5 + i);
    r.values = [
      row.memoNumber,
      formatDate(row.issuedAt),
      row.sku,
      row.itemName,
      row.category,
      row.quantity,
      row.returnedQuantity,
      outstanding,
      row.valueEach,
      outstandingValue,
    ];
    r.eachCell((cell) => {
      cell.font = font;
    });
    r.getCell(9).numFmt = '"LKR" #,##0.00';
    r.getCell(10).numFmt = '"LKR" #,##0.00';
  });

  const totalRow = sheet.getRow(5 + rows.length + 1);
  totalRow.getCell(9).value = "Total outstanding:";
  totalRow.getCell(9).font = { ...font, bold: true };
  totalRow.getCell(10).value = totalOutstandingValue;
  totalRow.getCell(10).numFmt = '"LKR" #,##0.00';
  totalRow.getCell(10).font = { ...font, bold: true };

  sheet.columns = [
    { width: 16 },
    { width: 13 },
    { width: 16 },
    { width: 28 },
    { width: 14 },
    { width: 10 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function brokerStatementEmailHtml(brokerName: string, totalOutstandingValue: number) {
  return `
    <div style="font-family: Arial, sans-serif; color: #1c1917;">
      <h2 style="color: #a66316;">Baza ERP — Memo statement</h2>
      <p>Dear ${brokerName},</p>
      <p>Attached is your updated memo statement listing the gemstones and jewelry currently with you,
      along with your full memo history.</p>
      <p><strong>Current outstanding value: ${formatMoney(totalOutstandingValue)}</strong></p>
      <p style="color: #78716c; font-size: 13px;">This statement reflects our records as of today. Please
      contact us if anything doesn't match what you're holding.</p>
    </div>
  `;
}
