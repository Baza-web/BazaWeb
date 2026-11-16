import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { branchScope, canViewCost } from "@/lib/rbac";
import { buildExportSheet, xlsxResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";

type Row = Awaited<ReturnType<typeof getItems>>[number];

async function getItems(
  session: Awaited<ReturnType<typeof requireSession>>,
  q?: string,
  status?: string,
  brandId?: string,
) {
  return db.inventoryItem.findMany({
    where: {
      ...branchScope(session),
      ...(status ? { status: status as never } : {}),
      ...(brandId ? { brandId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { sku: { contains: q, mode: "insensitive" as const } },
              { gemstoneType: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { branch: true, brand: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
}

function buildColumns(showCost: boolean): ExportColumn<Row>[] {
  const cols: ExportColumn<Row>[] = [
    { header: "SKU", value: (r) => r.sku, width: 16 },
    { header: "Name", value: (r) => r.name, width: 26 },
    { header: "Category", value: (r) => r.category, width: 14 },
    { header: "Branch", value: (r) => r.branch.name, width: 16 },
    { header: "Brand", value: (r) => r.brand?.name, width: 16 },
    { header: "Metal type", value: (r) => r.metalType, width: 14 },
    { header: "Metal purity", value: (r) => r.metalPurity, width: 12 },
    { header: "Gross weight (g)", value: (r) => r.grossWeightG, width: 14 },
    { header: "Net weight (g)", value: (r) => r.netWeightG, width: 14 },
    { header: "Gemstone type", value: (r) => r.gemstoneType, width: 16 },
    { header: "Carat weight", value: (r) => r.caratWeight, width: 12 },
  ];
  if (showCost) cols.push({ header: "Cost price", value: (r) => r.costPrice, format: "money", width: 14 });
  cols.push(
    { header: "Selling price", value: (r) => r.sellingPrice, format: "money", width: 14 },
    { header: "Quantity", value: (r) => r.quantity, width: 10 },
    { header: "Low stock at", value: (r) => r.lowStockAt, width: 12 },
    { header: "Status", value: (r) => r.status, width: 14 },
  );
  return cols;
}

export async function GET(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthenticated", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const brandId = searchParams.get("brandId") ?? undefined;
  const items = await getItems(session, q, status, brandId);
  const showCost = canViewCost(session.role);

  const buffer = await buildExportSheet("Inventory", buildColumns(showCost), items, (r) => r.id);
  return xlsxResponse(buffer, timestampedFilename("inventory"));
}
