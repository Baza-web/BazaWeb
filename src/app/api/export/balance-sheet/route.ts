import { requireSession } from "@/lib/auth";
import { canManageAccounting } from "@/lib/rbac";
import { getBalanceSheet } from "@/lib/financialStatements";
import { buildExportSheet, xlsxResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";

type Row = { section: string; code: string; name: string; balance: number };

const columns: ExportColumn<Row>[] = [
  { header: "Section", value: (r) => r.section, width: 14 },
  { header: "Account code", value: (r) => r.code, width: 12 },
  { header: "Account name", value: (r) => r.name, width: 28 },
  { header: "Balance", value: (r) => r.balance, format: "money", width: 16 },
];

export async function GET(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthenticated", { status: 401 });
  }
  if (!canManageAccounting(session.roles)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const asOf = searchParams.get("asOf");
  const branchId = searchParams.get("branchId");
  const asOfDate = asOf ? new Date(asOf) : new Date();
  asOfDate.setHours(23, 59, 59, 999);

  const sheet = await getBalanceSheet(session, asOfDate, branchId);
  const rows: Row[] = [
    ...sheet.assetRows.map((r) => ({ section: "Asset", code: r.account.code, name: r.account.name, balance: r.balance })),
    { section: "Asset", code: "", name: "Total Assets", balance: sheet.totalAssets },
    ...sheet.liabilityRows.map((r) => ({ section: "Liability", code: r.account.code, name: r.account.name, balance: r.balance })),
    { section: "Liability", code: "", name: "Total Liabilities", balance: sheet.totalLiabilities },
    ...sheet.equityRows.map((r) => ({ section: "Equity", code: r.account.code, name: r.account.name, balance: r.balance })),
    { section: "Equity", code: "", name: "Current Year Earnings", balance: sheet.currentYearEarnings },
    { section: "Equity", code: "", name: "Total Equity", balance: sheet.totalEquity },
  ];

  const buffer = await buildExportSheet("Balance Sheet", columns, rows);
  return xlsxResponse(buffer, timestampedFilename("balance-sheet"));
}
