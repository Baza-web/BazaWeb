import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { canViewCost, canViewSellingPrice } from "@/lib/rbac";
import { buildExportSheet, xlsxResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";

type Row = Awaited<ReturnType<typeof getItems>>[number];

// Matches the inventory list page: stock is visible company-wide to every role, so the
// export isn't branch-scoped either. Price-tier visibility is still enforced below.
async function getItems(
  q?: string,
  status?: string,
  brandId?: string,
  branchId?: string,
) {
  return db.inventoryItem.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
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

function buildColumns(showCost: boolean, showSelling: boolean): ExportColumn<Row>[] {
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
  if (showSelling) cols.push({ header: "Selling price", value: (r) => r.sellingPrice, format: "money", width: 14 });
  cols.push(
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
  const branchId = searchParams.get("branchId") ?? undefined;
  const items = await getItems(q, status, brandId, branchId);
  const showCost = canViewCost(session.roles);
  const showSelling = canViewSellingPrice(session.roles);

  const buffer = await buildExportSheet("Inventory", buildColumns(showCost, showSelling), items, (r) => r.id);
  return xlsxResponse(buffer, timestampedFilename("inventory"));
}
