import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canViewCost, canDeleteOrRequest } from "@/lib/rbac";
import { formatMoney } from "@/lib/utils";
import { deleteInventoryItemPermanently } from "./actions";
import { DeleteRecordButton } from "@/components/DeleteRecordButton";
import { Plus } from "@phosphor-icons/react/ssr";
import { PrintButton } from "@/components/PrintButton";

const STATUS_COLORS: Record<string, string> = {
  IN_STOCK: "bg-green-100 text-green-700",
  RESERVED: "bg-amber-100 text-amber-700",
  SOLD: "bg-stone-200 text-stone-600",
  IN_REPAIR: "bg-blue-100 text-blue-700",
  CONSIGNMENT: "bg-purple-100 text-purple-700",
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; brandId?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const showCost = canViewCost(session.role);
  const canDelete = canDeleteOrRequest(session.role);
  const { q, status, brandId } = await searchParams;

  const [items, brands] = await Promise.all([
    db.inventoryItem.findMany({
      where: {
        ...branchScope(session),
        ...(status ? { status: status as never } : {}),
        ...(brandId ? { brandId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { gemstoneType: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { branch: true, brand: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const lowStock = items.filter((i) => i.status === "IN_STOCK" && i.quantity <= i.lowStockAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Inventory</h1>
        <div className="flex items-center gap-2">
          <PrintButton selector="#inventory-table" />
          <Link href="/inventory/new" className="btn-primary print:hidden">
            <Plus size={16} aria-hidden="true" />
            Add item
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Inventory report</h2>
        <p className="text-sm text-stone-500">Printed {new Date().toLocaleDateString()} — {items.length} item(s)</p>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {lowStock.length} item{lowStock.length > 1 ? "s" : ""} at or below the low-stock threshold.
        </div>
      )}

      <form className="card flex flex-wrap gap-3 print:hidden" action="/inventory">
        <input
          className="input max-w-xs"
          name="q"
          placeholder="Search by name, SKU, gemstone…"
          defaultValue={q}
        />
        <select className="input max-w-[180px]" name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="IN_STOCK">In stock</option>
          <option value="RESERVED">Reserved</option>
          <option value="SOLD">Sold</option>
          <option value="IN_REPAIR">In repair</option>
          <option value="CONSIGNMENT">Consignment</option>
        </select>
        {brands.length > 0 && (
          <select className="input max-w-[180px]" name="brandId" defaultValue={brandId ?? ""}>
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </form>

      <div id="inventory-table" className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th>Branch</th>
              <th>Brand</th>
              <th>Qty</th>
              {showCost && <th>Cost</th>}
              <th>Price</th>
              <th>Status</th>
              {canDelete && <th className="print:hidden">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} data-print-row>
                <td className="print:hidden">
                  <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include ${item.sku} in print`} />
                </td>
                <td>
                  <Link href={`/inventory/${item.id}`} className="text-brand-700 hover:underline">
                    {item.sku}
                  </Link>
                </td>
                <td>{item.name}</td>
                <td>{item.category.replace("_", " ")}</td>
                <td>{item.branch.name}</td>
                <td className="text-xs text-stone-500">{item.brand?.name ?? "—"}</td>
                <td>
                  <span className={item.quantity <= item.lowStockAt ? "font-semibold text-amber-700" : undefined}>
                    {item.quantity}
                  </span>
                  {item.status === "IN_STOCK" && item.quantity <= item.lowStockAt && (
                    <span className="badge ml-2 bg-amber-100 text-amber-700">
                      {item.quantity === 1 ? "Last piece" : "Low stock"}
                    </span>
                  )}
                </td>
                {showCost && <td>{formatMoney(item.costPrice)}</td>}
                <td>{formatMoney(item.sellingPrice)}</td>
                <td>
                  <span className={`badge ${STATUS_COLORS[item.status]}`}>
                    {item.status.replace("_", " ")}
                  </span>
                </td>
                {canDelete && (
                  <td className="print:hidden">
                    <DeleteRecordButton
                      action={deleteInventoryItemPermanently.bind(null, item.id)}
                      label="item"
                      isOwner={session.role === "OWNER"}
                      confirmMessage={`Permanently delete ${item.sku} — ${item.name}? This can't be undone.`}
                      requestMessage={`Request permanent deletion of ${item.sku} — ${item.name}? An Owner will need to approve it before anything happens.`}
                    />
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={showCost ? (canDelete ? 11 : 10) : canDelete ? 10 : 9} className="py-6 text-center text-stone-400">
                  No items match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
