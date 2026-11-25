import { requireSession } from "@/lib/auth";
import { canManageInventory, canViewCost } from "@/lib/rbac";
import { inventoryBulkCreateHeaders } from "@/lib/bulkCreateColumns";
import { buildExportSheet, xlsxResponse, type ExportColumn } from "@/lib/xlsxExport";

/** One example row showing the expected format — SKU and Branch are the two fields people most often get wrong. */
const EXAMPLE_ROW: Record<string, string> = {
  SKU: "BZ-1001",
  Name: "Gold Chain Necklace",
  Category: "NECKLACE",
  Branch: "Main Branch",
  Brand: "",
  "Metal type": "Gold",
  "Metal purity": "22K",
  "Gross weight (g)": "12.5",
  "Net weight (g)": "12.2",
  "Gemstone type": "",
  "Carat weight": "",
  Clarity: "",
  Cut: "",
  Certification: "",
  "Cost price": "45000",
  "Selling price": "62000",
  Quantity: "1",
  "Low stock at": "1",
  Notes: "",
};

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthenticated", { status: 401 });
  }
  if (!canManageInventory(session.roles)) return new Response("Forbidden", { status: 403 });

  const headers = inventoryBulkCreateHeaders(canViewCost(session.roles));
  const columns: ExportColumn<Record<string, string>>[] = headers.map((h) => ({
    header: h,
    width: 18,
    value: (row) => row[h] ?? "",
  }));

  const buffer = await buildExportSheet("New items", columns, [EXAMPLE_ROW]);
  return xlsxResponse(buffer, "inventory-new-items-template.xlsx");
}
