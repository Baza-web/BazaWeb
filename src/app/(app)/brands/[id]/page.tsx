import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageBrands } from "@/lib/rbac";
import { formatMoney, round2 } from "@/lib/utils";
import { SalesTrendChart } from "@/components/SalesTrendChart";
import { TrendUp, TrendDown } from "@phosphor-icons/react/ssr";

function TrendBadge({ change }: { change: number }) {
  const isUp = change >= 0;
  const Icon = isUp ? TrendUp : TrendDown;
  return (
    <p className={`flex items-center gap-1 text-sm font-semibold ${isUp ? "text-green-700" : "text-red-700"}`}>
      <Icon size={14} aria-hidden="true" />
      {Math.abs(change).toFixed(1)}%
    </p>
  );
}

export default async function BrandDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { id } = await params;
  const [brand, allBrands] = await Promise.all([
    db.brand.findUnique({ where: { id } }),
    db.brand.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!brand) notFound();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const trendStart = new Date(now);
  trendStart.setDate(trendStart.getDate() - 29);
  trendStart.setHours(0, 0, 0, 0);

  const [
    thisMonthSales,
    lastMonthSales,
    thisMonthExpenses,
    lastMonthExpenses,
    trendSales,
    inventoryItems,
    staff,
    recentSales,
  ] = await Promise.all([
    db.sale.findMany({ where: { brandId: id, createdAt: { gte: monthStart } }, select: { total: true } }),
    db.sale.findMany({ where: { brandId: id, createdAt: { gte: lastMonthStart, lte: lastMonthEnd } }, select: { total: true } }),
    db.expense.findMany({ where: { brandId: id, date: { gte: monthStart } }, select: { amount: true } }),
    db.expense.findMany({ where: { brandId: id, date: { gte: lastMonthStart, lte: lastMonthEnd } }, select: { amount: true } }),
    db.sale.findMany({ where: { brandId: id, createdAt: { gte: trendStart } }, select: { total: true, createdAt: true } }),
    db.inventoryItem.findMany({ where: { brandId: id }, select: { quantity: true, costPrice: true, status: true } }),
    db.staff.findMany({ where: { brands: { some: { id } }, deletedAt: null }, select: { id: true, name: true, role: true, active: true } }),
    db.sale.findMany({
      where: { brandId: id },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { customer: true },
    }),
  ]);

  const monthIncome = round2(thisMonthSales.reduce((s, x) => s + x.total, 0));
  const lastMonthIncome = round2(lastMonthSales.reduce((s, x) => s + x.total, 0));
  const monthExpense = round2(thisMonthExpenses.reduce((s, x) => s + x.amount, 0));
  const lastMonthExpense = round2(lastMonthExpenses.reduce((s, x) => s + x.amount, 0));
  const monthNet = round2(monthIncome - monthExpense);
  const lastMonthNet = round2(lastMonthIncome - lastMonthExpense);

  const incomeTrend = lastMonthIncome > 0 ? round2(((monthIncome - lastMonthIncome) / lastMonthIncome) * 100) : monthIncome > 0 ? 100 : 0;
  const netTrend = lastMonthNet !== 0 ? round2(((monthNet - lastMonthNet) / Math.abs(lastMonthNet)) * 100) : monthNet > 0 ? 100 : 0;

  const trendByDay = new Map<string, number>();
  for (const s of trendSales) {
    const key = s.createdAt.toISOString().slice(0, 10);
    trendByDay.set(key, (trendByDay.get(key) ?? 0) + s.total);
  }
  const trendData: { date: string; total: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(trendStart);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    trendData.push({ date: key, total: round2(trendByDay.get(key) ?? 0) });
  }

  const inStock = inventoryItems.filter((i) => i.status === "IN_STOCK" || i.status === "RESERVED");
  const stockValue = round2(inStock.reduce((s, i) => s + i.costPrice * i.quantity, 0));
  const stockUnits = inStock.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-stone-500">Brand dashboard</p>
          <h1 className="page-title">{brand.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <form
            action={async (formData: FormData) => {
              "use server";
              const { redirect } = await import("next/navigation");
              redirect(`/brands/${formData.get("brandId")}`);
            }}
            className="flex items-center gap-2"
          >
            <select className="input" name="brandId" defaultValue={brand.id}>
              {allBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {!b.active ? " (inactive)" : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-secondary">
              Switch
            </button>
          </form>
          <Link href="/brands" className="btn-secondary">
            All brands
          </Link>
        </div>
      </div>

      {!brand.active && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-600">
          This brand is currently inactive — it&apos;s hidden from dropdowns elsewhere in the app.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="card">
          <p className="text-xs text-stone-500">Month income</p>
          <p className="mt-1 text-xl font-semibold text-green-700">{formatMoney(monthIncome)}</p>
          <TrendBadge change={incomeTrend} />
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Month expenses</p>
          <p className="mt-1 text-xl font-semibold text-red-700">{formatMoney(monthExpense)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Net this month</p>
          <p className={`mt-1 text-xl font-semibold ${monthNet >= 0 ? "text-green-700" : "text-red-700"}`}>
            {formatMoney(monthNet)}
          </p>
          <TrendBadge change={netTrend} />
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Sales this month</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">{thisMonthSales.length}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Sales — last 30 days</h2>
        <SalesTrendChart data={trendData} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-medium">Inventory for this brand</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-stone-500">Units in stock</p>
              <p className="text-lg font-semibold">{stockUnits}</p>
            </div>
            <div>
              <p className="text-xs text-stone-500">Stock value (cost)</p>
              <p className="text-lg font-semibold">{formatMoney(stockValue)}</p>
            </div>
          </div>
          <Link href={`/inventory?brandId=${brand.id}`} className="mt-3 inline-block text-sm text-brand-700 hover:underline">
            View this brand&apos;s inventory →
          </Link>
        </div>

        <div className="card">
          <h2 className="mb-3 font-medium">Staff on this brand</h2>
          {staff.length === 0 ? (
            <p className="text-sm text-stone-400">No staff assigned to this brand yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {staff.map((s) => (
                <li key={s.id} className="flex items-center justify-between">
                  <Link href={`/staff/${s.id}`} className="text-brand-700 hover:underline">
                    {s.name}
                  </Link>
                  <span className={`badge ${s.active ? "bg-green-100 text-green-700" : "bg-stone-200 text-stone-600"}`}>
                    {s.active ? "Active" : "Inactive"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Recent sales</h2>
          <Link href={`/accounting?brandId=${brand.id}`} className="text-sm text-brand-700 hover:underline">
            Open Accounting for this brand →
          </Link>
        </div>
        {recentSales.length === 0 ? (
          <p className="text-sm text-stone-400">No sales recorded for this brand yet.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/sales/${s.id}`} className="text-brand-700 hover:underline">
                      {s.invoiceNumber}
                    </Link>
                  </td>
                  <td>{s.customer?.name ?? "Walk-in customer"}</td>
                  <td>{formatMoney(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href={`/creative?brand=${brand.id}`} className="btn-secondary text-sm">
          Open Creative Hub for this brand
        </Link>
        <Link href={`/accounting/statements?brandId=${brand.id}`} className="btn-secondary text-sm">
          Financial statements for this brand
        </Link>
      </div>
    </div>
  );
}
