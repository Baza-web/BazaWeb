import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { branchScope, canManageAccounting, canManagePurchasing } from "@/lib/rbac";
import { buildExportWorkbook, xlsxResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthenticated", { status: 401 });
  }
  if (!canManagePurchasing(session.role) && !canManageAccounting(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const [suppliers, orders] = await Promise.all([
    db.supplier.findMany({ orderBy: { name: "asc" } }),
    db.purchaseOrder.findMany({
      where: branchScope(session),
      include: { supplier: true, branch: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
  ]);

  const supplierColumns: ExportColumn<(typeof suppliers)[number]>[] = [
    { header: "Name", value: (s) => s.name, width: 24 },
    { header: "Contact person", value: (s) => s.contactName, width: 20 },
    { header: "Phone", value: (s) => s.phone, width: 16 },
    { header: "Email", value: (s) => s.email, width: 24 },
    { header: "Address", value: (s) => s.address, width: 30 },
    { header: "Notes", value: (s) => s.notes, width: 30 },
  ];

  const orderColumns: ExportColumn<(typeof orders)[number]>[] = [
    { header: "Order #", value: (o) => o.orderNumber, width: 20 },
    { header: "Supplier", value: (o) => o.supplier.name, width: 22 },
    { header: "Branch", value: (o) => o.branch.name, width: 16 },
    { header: "Order date", value: (o) => o.orderDate, format: "date", width: 14 },
    { header: "Expected date", value: (o) => o.expectedDate, format: "date", width: 14 },
    { header: "Items", value: (o) => o.items.length, width: 10 },
    { header: "Total amount", value: (o) => o.totalAmount, format: "money", width: 14 },
    { header: "Amount paid", value: (o) => o.amountPaid, format: "money", width: 14 },
    { header: "Status", value: (o) => o.status, width: 14 },
    { header: "Notes", value: (o) => o.notes, width: 30 },
  ];

  const buffer = await buildExportWorkbook([
    { title: "Suppliers", columns: supplierColumns as ExportColumn<unknown>[], rows: suppliers, idOf: (r) => (r as (typeof suppliers)[number]).id },
    { title: "Purchase Orders", columns: orderColumns as ExportColumn<unknown>[], rows: orders, idOf: (r) => (r as (typeof orders)[number]).id },
  ]);
  return xlsxResponse(buffer, timestampedFilename("purchasing"));
}
