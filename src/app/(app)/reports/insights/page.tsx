import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canViewReports, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate, round2 } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";
import { computeRfmStats } from "@/lib/rfm";

export default async function ReportsInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canViewReports(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { branchId } = await searchParams;
  const scope = branchScope(session, branchId);
  const now = new Date();

  const [branches, customers, stockItems, soldItems, recentSales] = await Promise.all([
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.customer.findMany({
      where: scope,
      include: { sales: { select: { total: true, createdAt: true } } },
    }),
    db.inventoryItem.findMany({
      where: { ...scope, status: { in: ["IN_STOCK", "RESERVED"] } },
      select: { category: true, costPrice: true, quantity: true },
    }),
    db.saleItem.findMany({
      where: { sale: { ...scope, createdAt: { gte: new Date(now.getTime() - 60 * 86_400_000) } } },
      include: { inventoryItem: { select: { category: true, costPrice: true } } },
    }),
    db.sale.findMany({
      where: { ...scope, createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) } },
      select: { total: true, createdAt: true },
    }),
  ]);

  // --- Customer RFM segmentation ---
  type Seg = { id: string; name: string; phone: string | null; frequency: number; monetary: number; recencyDays: number };
  const withHistory: Seg[] = [];
  let neverPurchasedCount = 0;
  for (const c of customers) {
    const stats = computeRfmStats(c.sales);
    if (stats.recencyDays === null) {
      neverPurchasedCount++;
      continue;
    }
    withHistory.push({ id: c.id, name: c.name, phone: c.phone, frequency: stats.frequency, monetary: stats.monetary, recencyDays: stats.recencyDays });
  }

  const champions = withHistory
    .filter((c) => c.frequency >= 3 && c.recencyDays <= 90)
    .sort((a, b) => b.monetary - a.monetary)
    .slice(0, 10);
  const atRisk = withHistory
    .filter((c) => c.frequency >= 2 && c.recencyDays > 90 && c.recencyDays <= 365)
    .sort((a, b) => b.monetary - a.monetary)
    .slice(0, 10);
  const lost = withHistory
    .filter((c) => c.recencyDays > 365)
    .sort((a, b) => b.monetary - a.monetary)
    .slice(0, 5);
  const newCustomers = withHistory.filter((c) => c.frequency === 1 && c.recencyDays <= 90).length;

  // --- Inventory turnover / days of stock on hand, by category ---
  const stockByCategory = new Map<string, { value: number; units: number }>();
  for (const i of stockItems) {
    const row = stockByCategory.get(i.category) ?? { value: 0, units: 0 };
    row.value += i.costPrice * i.quantity;
    row.units += i.quantity;
    stockByCategory.set(i.category, row);
  }
  const costSold60ByCategory = new Map<string, number>();
  for (const item of soldItems) {
    const category = item.inventoryItem.category;
    costSold60ByCategory.set(category, (costSold60ByCategory.get(category) ?? 0) + item.inventoryItem.costPrice * item.quantity);
  }

  const turnoverRows = Array.from(stockByCategory.entries())
    .map(([category, stock]) => {
      const costSold = costSold60ByCategory.get(category) ?? 0;
      const dailyCogs = costSold / 60;
      const daysOfStock = dailyCogs > 0 ? Math.round(stock.value / dailyCogs) : null;
      return { category, stockValue: round2(stock.value), units: stock.units, daysOfStock };
    })
    .sort((a, b) => b.stockValue - a.stockValue);

  // --- Simple revenue forecast (average of the last 3 full months) ---
  const monthTotals = new Map<string, number>();
  for (const s of recentSales) {
    const key = `${s.createdAt.getFullYear()}-${s.createdAt.getMonth()}`;
    monthTotals.set(key, (monthTotals.get(key) ?? 0) + s.total);
  }
  const fullMonthKeys: string[] = [];
  for (let i = 3; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    fullMonthKeys.push(`${d.getFullYear()}-${d.getMonth()}`);
  }
  const fullMonthTotals = fullMonthKeys.map((k) => monthTotals.get(k) ?? 0);
  const forecastNextMonth =
    fullMonthTotals.length > 0 ? round2(fullMonthTotals.reduce((s, v) => s + v, 0) / fullMonthTotals.length) : 0;

  // --- Narrative insights ---
  const insights: string[] = [];
  if (atRisk.length > 0) {
    const atRiskValue = round2(atRisk.reduce((s, c) => s + c.monetary, 0));
    insights.push(
      `${atRisk.length} previously loyal customer${atRisk.length === 1 ? "" : "s"} (worth ${formatMoney(atRiskValue)} in lifetime spend) haven't bought in 3–12 months — a call or WhatsApp message could win them back.`,
    );
  }
  if (lost.length > 0) {
    insights.push(`${lost.length} customer${lost.length === 1 ? "" : "s"} haven't purchased in over a year — consider a win-back offer.`);
  }
  const lowStockTurnover = turnoverRows.find((r) => r.daysOfStock !== null && r.daysOfStock > 180);
  if (lowStockTurnover) {
    insights.push(
      `"${lowStockTurnover.category}" has about ${lowStockTurnover.daysOfStock} days of stock on hand at the recent sales pace — that's cash sitting slow-moving on the shelf.`,
    );
  }
  const fastTurnover = turnoverRows.find((r) => r.daysOfStock !== null && r.daysOfStock < 30);
  if (fastTurnover) {
    insights.push(`"${fastTurnover.category}" is selling fast — about ${fastTurnover.daysOfStock} days of stock left. Consider restocking soon.`);
  }
  if (newCustomers > 0) {
    insights.push(`${newCustomers} new customer${newCustomers === 1 ? "" : "s"} made their first purchase in the last 90 days.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">Deep insights</h1>
          <p className="text-sm text-stone-500">Customer segmentation, inventory turnover, and a simple forecast.</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton label="Print" />
          <Link href="/reports" className="btn-secondary">
            Back to Reports
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Deep insights</h2>
        <p className="text-sm text-stone-500">Printed {formatDate(new Date())}</p>
      </div>

      {isCompanyWide(session.role) && branches.length > 1 && (
        <form className="card flex flex-wrap items-end gap-3" action="/reports/insights">
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
          <button type="submit" className="btn-secondary">
            Apply
          </button>
        </form>
      )}

      <div className="card max-w-xl">
        <h2 className="mb-3 font-medium">Key findings</h2>
        {insights.length > 0 ? (
          <ul className="list-disc space-y-2 pl-5 text-sm text-stone-700">
            {insights.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-400">Not enough activity yet to surface findings.</p>
        )}
      </div>

      <div className="card">
        <h2 className="mb-1 font-medium">Next month's revenue — simple forecast</h2>
        <p className="mb-3 text-xs text-stone-400">
          Average of the last 3 full months — a rough estimate, not a guarantee.
        </p>
        <p className="text-2xl font-semibold text-ink-900">{formatMoney(forecastNextMonth)}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <h2 className="mb-1 flex items-center gap-2 font-medium">Champions — your best customers</h2>
          <p className="mb-3 text-xs text-stone-400">3+ purchases, bought within the last 90 days.</p>
          <table className="table-base">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Orders</th>
                <th>Lifetime spend</th>
              </tr>
            </thead>
            <tbody>
              {champions.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/customers/${c.id}`} className="text-brand-700 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td>{c.frequency}</td>
                  <td>{formatMoney(c.monetary)}</td>
                </tr>
              ))}
              {champions.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-stone-400">
                    No champions yet in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto">
          <h2 className="mb-1 font-medium">At risk — worth a follow-up</h2>
          <p className="mb-3 text-xs text-stone-400">2+ past purchases, nothing in the last 90–365 days.</p>
          <table className="table-base">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Last seen</th>
                <th>Lifetime spend</th>
              </tr>
            </thead>
            <tbody>
              {atRisk.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/customers/${c.id}`} className="text-brand-700 hover:underline">
                      {c.name}
                    </Link>
                    {c.phone && <div className="text-xs text-stone-400">{c.phone}</div>}
                  </td>
                  <td>{c.recencyDays}d ago</td>
                  <td>{formatMoney(c.monetary)}</td>
                </tr>
              ))}
              {atRisk.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-stone-400">
                    No at-risk customers right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-1 font-medium">Inventory turnover by category</h2>
        <p className="mb-3 text-xs text-stone-400">
          Days of stock on hand at the recent (60-day) sales pace — lower means it sells fast, higher means cash is
          sitting on the shelf.
        </p>
        <table className="table-base">
          <thead>
            <tr>
              <th>Category</th>
              <th>Units in stock</th>
              <th>Stock value (cost)</th>
              <th>Days of stock</th>
            </tr>
          </thead>
          <tbody>
            {turnoverRows.map((r) => (
              <tr key={r.category}>
                <td>{r.category.replace("_", " ")}</td>
                <td>{r.units}</td>
                <td>{formatMoney(r.stockValue)}</td>
                <td>
                  {r.daysOfStock === null ? (
                    <span className="text-stone-400">No recent sales</span>
                  ) : (
                    <span className={r.daysOfStock > 180 ? "text-amber-700" : r.daysOfStock < 30 ? "text-green-700" : undefined}>
                      {r.daysOfStock} days
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {turnoverRows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-stone-400">
                  No stock on hand.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-stone-400">
        {neverPurchasedCount} customer{neverPurchasedCount === 1 ? "" : "s"} on file {neverPurchasedCount === 1 ? "has" : "have"} never purchased yet.
      </p>
    </div>
  );
}
