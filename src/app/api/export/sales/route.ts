import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { branchScope, canRecordSale } from "@/lib/rbac";
import { buildExportSheet, xlsxResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";

type Row = Awaited<ReturnType<typeof getSales>>[number];

async function getSales(session: Awaited<ReturnType<typeof requireSession>>) {
  return db.sale.findMany({
    where: branchScope(session),
    include: { customer: true, branch: true, brand: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
}

const columns: ExportColumn<Row>[] = [
  { header: "Invoice", value: (r) => r.invoiceNumber, width: 22 },
  { header: "Date", value: (r) => r.createdAt, format: "datetime", width: 16 },
  { header: "Customer", value: (r) => r.customer?.name ?? "Walk-in", width: 24 },
  { header: "Branch", value: (r) => r.branch.name, width: 16 },
  { header: "Brand", value: (r) => r.brand?.name, width: 16 },
  { header: "Subtotal", value: (r) => r.subtotal, format: "money", width: 14 },
  { header: "Discount", value: (r) => r.discount, format: "money", width: 14 },
  { header: "Tax", value: (r) => r.tax, format: "money", width: 12 },
  { header: "Total", value: (r) => r.total, format: "money", width: 14 },
  { header: "Amount paid", value: (r) => r.amountPaid, format: "money", width: 14 },
  { header: "Payment status", value: (r) => r.paymentStatus, width: 14 },
  { header: "Payment method", value: (r) => r.paymentMethod, width: 14 },
  { header: "Notes", value: (r) => r.notes, width: 30 },
];

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthenticated", { status: 401 });
  }
  if (!canRecordSale(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const sales = await getSales(session);
  const buffer = await buildExportSheet("Sales", columns, sales, (r) => r.id);
  return xlsxResponse(buffer, timestampedFilename("sales"));
}
