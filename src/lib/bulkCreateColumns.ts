/**
 * Column headers for the bulk-create ("add new") templates — shared by the
 * template download routes and the row parsers in inventory/actions.ts and
 * customers/actions.ts, so they can never drift out of sync. Kept in a plain
 * module (not a "use server" actions file) since these aren't server actions.
 */
export function inventoryBulkCreateHeaders(showCost: boolean): string[] {
  return [
    "SKU",
    "Name",
    "Category",
    "Branch",
    "Brand",
    "Metal type",
    "Metal purity",
    "Gross weight (g)",
    "Net weight (g)",
    "Gemstone type",
    "Carat weight",
    "Clarity",
    "Cut",
    "Certification",
    ...(showCost ? ["Cost price"] : []),
    "Selling price",
    "Quantity",
    "Low stock at",
    "Notes",
  ];
}

export function customerBulkCreateHeaders(): string[] {
  return ["Name", "Phone", "Email", "Address", "Birthday", "Anniversary", "Branch"];
}
