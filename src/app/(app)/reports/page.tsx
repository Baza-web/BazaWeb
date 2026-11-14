import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canViewReports, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate } from "@/lib/utils";
import { Trophy, ChartPieSlice, ClockCountdown, Percent } from "@phosphor-icons/react/ssr";

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; branchId?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canViewReports(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { from, to, branchId } = await searchParams;
  const fromDate = from ? new Date(from) : startOfMonth();
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  const scope = branchScope(session, branchId);

  const [saleItemsInRange, staffLeaderboard, agingItems, branches] = await Promise.all([
    db.saleItem.findMany({
      where: { sale: { ...scope, createdAt: { gte: fromDate, lte: toDate } } },
      include: { inventoryItem: true },
    }),
    db.sale.groupBy({
      by: ["staffId"],
      where: { ...scope, createdAt: { gte: fromDate, lte: toDate } },
      _sum: { total: true },
      _count: true,
      orderBy: { _sum: { total: "desc" } },
      take: 10,
    }),
    db.inventoryItem.findMany({
      where: { ...scope, status: "IN_STOCK" },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  // Aggregate best-sellers and profit margin in JS — revenue per line is
  // priceEach * quantity, which Prisma's groupBy can't compute directly.
  const byItem = new Map<
    string,
    { name: string; sku: string; quantity: number; revenue: number; cost: number }
  >();
  for (const line of saleItemsInRange) {
    const existing = byItem.get(line.inventoryItemId) ?? {
      name: line.inventoryItem.name,
      sku: line.inventoryItem.sku,
      quantity: 0,
      revenue: 0,
      cost: 0,
    };
    existing.quantity += line.quantity;
    existing.revenue += line.priceEach * line.quantity;
    existing.cost += line.inventoryItem.costPrice * line.quantity;
    byItem.set(line.inventoryItemId, existing);
  }
  const bestSellers = [...byItem.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const totalRevenue = [...byItem.values()].reduce((s, i) => s + i.revenue, 0);
  const totalCost = [...byItem.values()].reduce((s, i) => s + i.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const staffIds = staffLeaderboard.map((s) => s.staffId);
  const staffById = staffIds.length
    ? Object.fromEntries((await db.staff.findMany({ where: { id: { in: staffIds } } })).map((s) => [s.id, s.name]))
    : {};

  return (
    <div className="space-y-6">
      <h1 className="page-title">Reports</h1>

      <form className="card flex flex-wrap items-end gap-3" action="/reports">
        <div>
          <label className="label">From</label>
          <input className="input" type="date" name="from" defaultValue={fromDate.toISOString().slice(0, 10)} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" name="to" defaultValue={toDate.toISOString().slice(0, 10)} />
        </div>
        {isCompanyWide(session.role) && (
          <div>
            <label className="label">Branch</label>
            <select className="input" name="branchId" defaultValue={branchId ?? ""}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="btn-secondary">
          Apply
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Revenue (range)</p>
            <ChartPieSlice size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-ink-900">{formatMoney(totalRevenue)}</p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Gross profit</p>
            <Percent size={18} className="text-green-600" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-green-700">{formatMoney(totalProfit)}</p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Margin</p>
            <Percent size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-ink-900">{margin.toFixed(1)}%</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Trophy size={18} className="text-brand-500" aria-hidden="true" />
          Best-selling items
        </h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Qty sold</th>
              <th>Revenue</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {bestSellers.map((item) => (
              <tr key={item.sku}>
                <td>{item.sku}</td>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.revenue)}</td>
                <td>{formatMoney(item.revenue - item.cost)}</td>
              </tr>
            ))}
            {bestSellers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-stone-400">
                  No sales in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Trophy size={18} className="text-brand-500" aria-hidden="true" />
          Staff sales leaderboard
        </h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Sales</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {staffLeaderboard.map((s) => (
              <tr key={s.staffId}>
                <td>{staffById[s.staffId] ?? "—"}</td>
                <td>{s._count}</td>
                <td>{formatMoney(s._sum.total ?? 0)}</td>
              </tr>
            ))}
            {staffLeaderboard.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-stone-400">
                  No sales in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <ClockCountdown size={18} className="text-brand-500" aria-hidden="true" />
          Inventory aging — oldest unsold items
        </h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>In stock since</th>
              <th>Days in stock</th>
            </tr>
          </thead>
          <tbody>
            {agingItems.map((item) => {
              const days = Math.floor((Date.now() - item.createdAt.getTime()) / 86_400_000);
              return (
                <tr key={item.id}>
                  <td>{item.sku}</td>
                  <td>{item.name}</td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{days}</td>
                </tr>
              );
            })}
            {agingItems.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-stone-400">
                  No in-stock items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
