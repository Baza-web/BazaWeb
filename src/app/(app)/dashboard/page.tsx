import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate } from "@/lib/utils";
import { Receipt, ChartLineUp, ChartLineDown, Sparkle, Package, ListChecks, Storefront } from "@phosphor-icons/react/ssr";

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function DashboardPage() {
  const session = await requireSessionOrRedirect();
  const scope = branchScope(session);
  const today = startOfDay();
  const monthStart = startOfMonth();

  const [todaySales, monthLedger, lowStockCandidates, myOpenTasks, recentSales, branchBreakdown] =
    await Promise.all([
      db.sale.aggregate({
        where: { ...scope, createdAt: { gte: today } },
        _sum: { total: true },
        _count: true,
      }),
      db.ledgerEntry.findMany({ where: { ...scope, date: { gte: monthStart } } }),
      db.inventoryItem.findMany({
        where: { ...scope, status: "IN_STOCK" },
        select: { quantity: true, lowStockAt: true },
      }),
      db.task.count({ where: { assignedToId: session.staffId, status: { not: "DONE" } } }),
      db.sale.findMany({
        where: scope,
        include: { customer: true, branch: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      isCompanyWide(session.role)
        ? db.sale.groupBy({
            by: ["branchId"],
            where: { createdAt: { gte: today } },
            _sum: { total: true },
          })
        : Promise.resolve([]),
    ]);

  const lowStockItems = lowStockCandidates.filter((i) => i.quantity <= i.lowStockAt).length;

  const monthIncome = monthLedger.filter((l) => l.type === "INCOME").reduce((s, l) => s + l.amount, 0);
  const monthExpense = monthLedger.filter((l) => l.type === "EXPENSE").reduce((s, l) => s + l.amount, 0);

  const branches = branchBreakdown.length
    ? await db.branch.findMany({ where: { id: { in: branchBreakdown.map((b) => b.branchId) } } })
    : [];

  return (
    <div className="space-y-6">
      <h1 className="page-title">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Today&apos;s sales</p>
            <Receipt size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-2xl font-semibold text-ink-900">{formatMoney(todaySales._sum.total ?? 0)}</p>
          <p className="text-xs text-stone-400">{todaySales._count} transaction(s)</p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Month income</p>
            <ChartLineUp size={18} className="text-green-600" aria-hidden="true" />
          </div>
          <p className="mt-1 text-2xl font-semibold text-green-700">{formatMoney(monthIncome)}</p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Month expenses</p>
            <ChartLineDown size={18} className="text-red-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-2xl font-semibold text-red-700">{formatMoney(monthExpense)}</p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Net this month</p>
            <Sparkle size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p
            className={`mt-1 text-2xl font-semibold ${
              monthIncome - monthExpense >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            {formatMoney(monthIncome - monthExpense)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/inventory?status=IN_STOCK" className="card-interactive flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50">
            <Package size={22} className="text-amber-600" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-stone-500">Low stock items</p>
            <p className="text-xl font-semibold text-ink-900">{lowStockItems}</p>
          </div>
        </Link>
        <Link href="/tasks?view=mine" className="card-interactive flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50">
            <ListChecks size={22} className="text-brand-600" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-stone-500">Your open tasks</p>
            <p className="text-xl font-semibold text-ink-900">{myOpenTasks}</p>
          </div>
        </Link>
      </div>

      {branches.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Storefront size={18} className="text-brand-500" aria-hidden="true" />
            Today by branch
          </h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {branchBreakdown.map((b) => {
              const branch = branches.find((br) => br.id === b.branchId);
              return (
                <li key={b.branchId} className="flex justify-between py-2">
                  <span>{branch?.name ?? "Unknown"}</span>
                  <span className="font-medium">{formatMoney(b._sum.total ?? 0)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="section-title mb-3">Recent sales</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Branch</th>
              <th>Total</th>
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
                <td>{formatDate(s.createdAt)}</td>
                <td>{s.customer?.name ?? "Walk-in"}</td>
                <td>{s.branch.name}</td>
                <td>{formatMoney(s.total)}</td>
              </tr>
            ))}
            {recentSales.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-stone-400">
                  No sales yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
