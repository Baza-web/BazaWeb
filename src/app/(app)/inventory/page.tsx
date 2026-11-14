import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope } from "@/lib/rbac";
import { formatMoney } from "@/lib/utils";
import { Plus } from "@phosphor-icons/react/ssr";

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
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const { q, status } = await searchParams;

  const items = await db.inventoryItem.findMany({
    where: {
      ...branchScope(session),
      ...(status ? { status: status as never } : {}),
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
    include: { branch: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const lowStock = items.filter((i) => i.status === "IN_STOCK" && i.quantity <= i.lowStockAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Inventory</h1>
        <Link href="/inventory/new" className="btn-primary">
          <Plus size={16} aria-hidden="true" />
          Add item
        </Link>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {lowStock.length} item{lowStock.length > 1 ? "s" : ""} at or below the low-stock threshold.
        </div>
      )}

      <form className="card flex flex-wrap gap-3" action="/inventory">
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
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th>Branch</th>
              <th>Qty</th>
              <th>Cost</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/inventory/${item.id}`} className="text-brand-700 hover:underline">
                    {item.sku}
                  </Link>
                </td>
                <td>{item.name}</td>
                <td>{item.category.replace("_", " ")}</td>
                <td>{item.branch.name}</td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.costPrice)}</td>
                <td>{formatMoney(item.sellingPrice)}</td>
                <td>
                  <span className={`badge ${STATUS_COLORS[item.status]}`}>
                    {item.status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-stone-400">
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
