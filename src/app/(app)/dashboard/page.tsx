import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate } from "@/lib/utils";

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
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card">
          <p className="text-xs text-stone-500">Today&apos;s sales</p>
          <p className="text-xl font-semibold">{formatMoney(todaySales._sum.total ?? 0)}</p>
          <p className="text-xs text-stone-400">{todaySales._count} transaction(s)</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">This month income</p>
          <p className="text-xl font-semibold text-green-700">{formatMoney(monthIncome)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">This month expenses</p>
          <p className="text-xl font-semibold text-red-700">{formatMoney(monthExpense)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Net this month</p>
          <p
            className={`text-xl font-semibold ${
              monthIncome - monthExpense >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            {formatMoney(monthIncome - monthExpense)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/inventory?status=IN_STOCK" className="card block hover:border-brand-300">
          <p className="text-xs text-stone-500">Low stock items</p>
          <p className="text-xl font-semibold">{lowStockItems}</p>
        </Link>
        <Link href="/tasks?view=mine" className="card block hover:border-brand-300">
          <p className="text-xs text-stone-500">Your open tasks</p>
          <p className="text-xl font-semibold">{myOpenTasks}</p>
        </Link>
      </div>

      {branches.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-medium">Today by branch</h2>
          <ul className="space-y-1 text-sm">
            {branchBreakdown.map((b) => {
              const branch = branches.find((br) => br.id === b.branchId);
              return (
                <li key={b.branchId} className="flex justify-between">
                  <span>{branch?.name ?? "Unknown"}</span>
                  <span className="font-medium">{formatMoney(b._sum.total ?? 0)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-medium">Recent sales</h2>
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
