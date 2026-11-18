import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { isCompanyWide, canManageOrdersScoped } from "@/lib/rbac";
import { buildExportSheet, buildCsv, xlsxResponse, csvResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";

type Row = Awaited<ReturnType<typeof getOrders>>[number];

async function getOrders(session: Awaited<ReturnType<typeof requireSession>>, brand?: string | null, from?: string | null, to?: string | null) {
  const scopeWhere = isCompanyWide(session.role) ? {} : { branchId: session.branchId ?? undefined };
  return db.order.findMany({
    where: {
      ...scopeWhere,
      ...(brand ? { brandId: brand } : {}),
      ...(from || to ? { orderDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: { brand: true, customer: true, primaryStaff: true, branch: true },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
}

const columns: ExportColumn<Row>[] = [
  { header: "Order #", value: (r) => r.orderNumber, width: 22 },
  { header: "Brand", value: (r) => r.brand?.name, width: 16 },
  { header: "Customer", value: (r) => r.customer?.name ?? r.customerContact, width: 24 },
  { header: "Order Type", value: (r) => r.orderType, width: 18 },
  { header: "Product/Service", value: (r) => r.productOrService, width: 28 },
  { header: "Department", value: (r) => r.department, width: 16 },
  { header: "Assigned", value: (r) => r.primaryStaff.name, width: 20 },
  { header: "Branch", value: (r) => r.branch?.name, width: 16 },
  { header: "Order Date", value: (r) => r.orderDate, format: "date", width: 14 },
  { header: "Original Deadline", value: (r) => r.originalDeadline, format: "date", width: 16 },
  { header: "Current Deadline", value: (r) => r.currentDeadline, format: "date", width: 16 },
  { header: "Status", value: (r) => r.status, width: 18 },
  { header: "Progress %", value: (r) => r.progressPercent, width: 12 },
  { header: "Order Value", value: (r) => r.orderValue, format: "money", width: 14 },
  { header: "Completed At", value: (r) => r.completedAt, format: "date", width: 14 },
];

export async function GET(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthenticated", { status: 401 });
  }
  if (!canManageOrdersScoped(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const orders = await getOrders(session, searchParams.get("brand"), searchParams.get("from"), searchParams.get("to"));

  if (format === "csv") {
    return csvResponse(buildCsv(columns, orders), timestampedFilename("orders", "csv"));
  }
  const buffer = await buildExportSheet("Orders", columns, orders, (r) => r.id);
  return xlsxResponse(buffer, timestampedFilename("orders"));
}
