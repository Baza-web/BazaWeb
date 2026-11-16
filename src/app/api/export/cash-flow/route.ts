import { requireSession } from "@/lib/auth";
import { canManageAccounting } from "@/lib/rbac";
import { getCashFlow } from "@/lib/financialStatements";
import { buildExportSheet, xlsxResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";

type Row = Awaited<ReturnType<typeof getCashFlow>>["rows"][number];

const columns: ExportColumn<Row>[] = [
  { header: "Date", value: (r) => r.line.journalEntry.date, format: "date", width: 14 },
  { header: "Entry #", value: (r) => r.line.journalEntry.entryNumber, width: 16 },
  { header: "Description", value: (r) => r.line.journalEntry.description, width: 36 },
  { header: "Category", value: (r) => r.category, width: 14 },
  { header: "Amount", value: (r) => r.movement, format: "money", width: 14 },
];

export async function GET(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthenticated", { status: 401 });
  }
  if (!canManageAccounting(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const branchId = searchParams.get("branchId");
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  const flow = await getCashFlow(session, fromDate, toDate, branchId);
  const buffer = await buildExportSheet("Cash Flow", columns, flow.rows, (r) => r.line.id);
  return xlsxResponse(buffer, timestampedFilename("cash-flow"));
}
