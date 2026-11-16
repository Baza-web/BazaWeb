import { requireSession } from "@/lib/auth";
import { canManageAccounting } from "@/lib/rbac";
import { getApAging, AGING_BUCKETS } from "@/lib/financialStatements";
import { buildExportSheet, xlsxResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";

type Row = Awaited<ReturnType<typeof getApAging>>["supplierRows"][number];

const columns: ExportColumn<Row>[] = [
  { header: "Supplier", value: (r) => r.name, width: 28 },
  { header: "Open orders", value: (r) => r.orderCount, width: 14 },
  ...AGING_BUCKETS.map((b): ExportColumn<Row> => ({ header: b, value: (r) => r.buckets[b] || null, format: "money", width: 16 })),
  { header: "Total owed", value: (r) => r.total, format: "money", width: 16 },
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
  const asOf = searchParams.get("asOf");
  const branchId = searchParams.get("branchId");
  const asOfDate = asOf ? new Date(asOf) : new Date();
  asOfDate.setHours(23, 59, 59, 999);

  const aging = await getApAging(session, asOfDate, branchId);
  const buffer = await buildExportSheet("AP Aging", columns, aging.supplierRows, (r) => r.key);
  return xlsxResponse(buffer, timestampedFilename("ap-aging"));
}
