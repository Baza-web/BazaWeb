import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect, type SessionPayload } from "@/lib/auth";
import {
  branchScope,
  isCompanyWide,
  canReviewLeave,
  canViewAttendance,
  canManagePurchasing,
  canManageAccounting,
  canManageSalesTargets,
  canManageRepairs,
  canManageBrokers,
  canAssignTasks,
} from "@/lib/rbac";
import { formatMoney, formatDate, round2 } from "@/lib/utils";
import { RankedBarChart } from "@/components/RankedBarChart";
import { SalesTrendChart } from "@/components/SalesTrendChart";
import {
  Receipt,
  ChartLineUp,
  ChartLineDown,
  Sparkle,
  ListChecks,
  Storefront,
  Diamond,
  Crown,
  UsersThree,
  Wallet,
  Wrench,
  CalendarCheck,
  ClockCountdown,
  Truck,
  Handshake,
  CaretUp,
  CaretDown,
} from "@/components/icons";

function startOfDay(d = new Date()) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Groups rows by a label, summing the given numeric accessors, ranked by `count` descending with a top-N + "Other" fold. */
function rankedBreakdown<T>(
  items: T[],
  labelFn: (item: T) => string,
  countFn: (item: T) => number,
  valueFn: (item: T) => number,
  topN = 7,
) {
  const map = new Map<string, { label: string; count: number; value: number }>();
  for (const item of items) {
    const label = labelFn(item) || "Unspecified";
    const entry = map.get(label) ?? { label, count: 0, value: 0 };
    entry.count += countFn(item);
    entry.value += valueFn(item);
    map.set(label, entry);
  }
  const rows = Array.from(map.values()).sort((a, b) => b.count - a.count);
  if (rows.length <= topN) return rows;
  const top = rows.slice(0, topN);
  const rest = rows.slice(topN);
  const other = rest.reduce(
    (acc, r) => ({ label: "Other", count: acc.count + r.count, value: acc.value + r.value }),
    { label: "Other", count: 0, value: 0 },
  );
  return [...top, other];
}

/** A small up/down-arrow + percent pill for "vs last month" comparisons. Hidden when there's no prior-period baseline to compare against (avoids a misleading 0%/∞% on day one of a new branch). */
function TrendBadge({ current, previous, goodDirection = "up" }: { current: number; previous: number; goodDirection?: "up" | "down" }) {
  if (previous === 0) return null;
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return null;
  const up = percent > 0;
  const isGood = goodDirection === "up" ? up : !up;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isGood ? "text-green-600" : "text-red-600"}`}>
      {up ? <CaretUp size={11} weight="bold" aria-hidden="true" /> : <CaretDown size={11} weight="bold" aria-hidden="true" />}
      {Math.abs(percent)}%
    </span>
  );
}

/**
 * Shared across every dashboard. Anyone who can assign tasks (Owner/Admin/Manager —
 * via the union of their roles, so an extra Manager role picked up through multi-role
 * grants this too) sees the branch/company-wide pending-task count plus a quick project
 * breakdown; everyone else sees just their own open tasks, same scoping as /tasks?view=mine.
 */
async function ProjectsTasksWidget({ session }: { session: SessionPayload }) {
  const manager = canAssignTasks(session.roles);

  if (manager) {
    const scope = branchScope(session);
    const projects = await db.project.findMany({
      include: { brand: true, tasks: { where: scope, select: { status: true } } },
      orderBy: [{ brandId: "asc" }, { name: "asc" }],
    });
    const pendingTotal = projects.reduce((sum, p) => sum + p.tasks.filter((t) => t.status === "PENDING").length, 0);
    const unsortedPending = await db.task.count({ where: { ...scope, projectId: null, status: "PENDING" } });
    const topProjects = projects
      .map((p) => ({
        id: p.id,
        name: p.name,
        isBrand: Boolean(p.brandId),
        pending: p.tasks.filter((t) => t.status === "PENDING").length,
      }))
      .filter((p) => p.pending > 0)
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 5);

    return (
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2">
            <ListChecks size={18} className="text-brand-600" aria-hidden="true" />
            Projects &amp; Tasks
          </h2>
          <Link href="/tasks" className="text-xs font-medium text-brand-700 hover:underline">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/tasks" className="rounded-xl bg-stone-50 p-3 transition hover:bg-stone-100">
            <p className="text-xs text-stone-500">Pending tasks</p>
            <p className="text-xl font-semibold text-ink-900">{pendingTotal + unsortedPending}</p>
          </Link>
          <Link href="/tasks?view=projects" className="rounded-xl bg-stone-50 p-3 transition hover:bg-stone-100">
            <p className="text-xs text-stone-500">Active projects</p>
            <p className="text-xl font-semibold text-ink-900">{projects.length}</p>
          </Link>
        </div>
        {topProjects.length > 0 ? (
          <ul className="divide-y divide-stone-100 text-sm">
            {topProjects.map((p) => (
              <li key={p.id}>
                <Link href={`/tasks/project/${p.id}`} className="flex items-center justify-between py-2 hover:text-brand-700">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{p.name}</span>
                    <span className={`badge shrink-0 ${p.isBrand ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                      {p.isBrand ? "Brand" : "Special"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-stone-500">{p.pending} pending</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-400">No pending tasks on any project right now.</p>
        )}
      </div>
    );
  }

  const myTasksWhere = {
    status: { not: "DONE" as const },
    OR: [{ assignedToId: session.staffId }, { group: { members: { some: { id: session.staffId } } } }],
  };
  const [myOpenCount, myUpcoming] = await Promise.all([
    db.task.count({ where: myTasksWhere }),
    db.task.findMany({
      where: myTasksWhere,
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 5,
      include: { project: true },
    }),
  ]);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-title flex items-center gap-2">
          <ListChecks size={18} className="text-brand-600" aria-hidden="true" />
          Your Tasks
        </h2>
        <Link href="/tasks?view=mine" className="text-xs font-medium text-brand-700 hover:underline">
          View all
        </Link>
      </div>
      <div className="rounded-xl bg-stone-50 p-3">
        <p className="text-xs text-stone-500">Open tasks</p>
        <p className="text-xl font-semibold text-ink-900">{myOpenCount}</p>
      </div>
      {myUpcoming.length > 0 ? (
        <ul className="divide-y divide-stone-100 text-sm">
          {myUpcoming.map((t) => (
            <li key={t.id}>
              <Link href={`/tasks/${t.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-brand-700">
                <span className="min-w-0 truncate">{t.title}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-stone-500">
                  {t.project && <span className="badge bg-brand-50 text-brand-700">{t.project.name}</span>}
                  {t.dueDate && formatDate(t.dueDate)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-400">Nothing open right now.</p>
      )}
    </div>
  );
}

/**
 * Sales staff get a stripped-down dashboard: their own sales figures and
 * tasks, plus the whole branch's combined target progress (a "team target"
 * that never reveals any individual colleague's numbers). No financial
 * (expenses/profit/outstanding), inventory, or other staff's sales data.
 */
async function SalesStaffDashboard({ session }: { session: SessionPayload }) {
  const today = startOfDay();
  const monthStart = startOfMonth();
  const thirtyDaysAgo = startOfDay(new Date(today.getTime() - 29 * 86_400_000));
  const mine = { staffId: session.staffId };

  const lastMonthStart = startOfMonth(new Date(today.getFullYear(), today.getMonth() - 1, 1));

  const [todaySales, monthSales, lastMonthSales, recentSales, trendSales, myOpenTasks, branchTargets] = await Promise.all([
    db.sale.aggregate({ where: { ...mine, createdAt: { gte: today } }, _sum: { total: true }, _count: true }),
    db.sale.aggregate({ where: { ...mine, createdAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
    db.sale.aggregate({ where: { ...mine, createdAt: { gte: lastMonthStart, lt: monthStart } }, _sum: { total: true } }),
    db.sale.findMany({ where: mine, include: { customer: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.sale.findMany({ where: { ...mine, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true, total: true } }),
    db.task.count({ where: { assignedToId: session.staffId, status: { not: "DONE" } } }),
    db.salesTarget.findMany({ where: { periodEnd: { gte: today }, branchId: session.branchId ?? "__none__" } }),
  ]);

  const avgSaleThisMonth = monthSales._count > 0 ? round2((monthSales._sum.total ?? 0) / monthSales._count) : 0;

  const targetsWithProgress = await Promise.all(
    branchTargets.map(async (t) => {
      const achieved = await db.sale.aggregate({
        where: { staffId: t.staffId, createdAt: { gte: t.periodStart, lte: t.periodEnd } },
        _sum: { total: true },
      });
      return { target: t.targetAmount, achieved: achieved._sum.total ?? 0 };
    }),
  );
  const targetSum = targetsWithProgress.reduce((s, t) => s + t.target, 0);
  const targetAchievedSum = targetsWithProgress.reduce((s, t) => s + t.achieved, 0);
  const teamTargetPercent = targetSum > 0 ? Math.round((targetAchievedSum / targetSum) * 100) : null;

  const trendMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo.getTime() + i * 86_400_000);
    trendMap.set(dayKey(d), 0);
  }
  for (const sale of trendSales) {
    const key = dayKey(sale.createdAt);
    trendMap.set(key, (trendMap.get(key) ?? 0) + sale.total);
  }
  const trendData = Array.from(trendMap.entries()).map(([date, total]) => ({ date, total: round2(total) }));

  return (
    <div className="space-y-6">
      <h1 className="page-title">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="stat-tile-highlight col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">Your sales · this month</p>
            <Receipt size={18} className="text-white/70" aria-hidden="true" />
          </div>
          <p className="mt-1 text-2xl font-semibold sm:text-3xl">{formatMoney(monthSales._sum.total ?? 0)}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/70">
            <span>{monthSales._count} sale(s)</span>
            <TrendBadge current={monthSales._sum.total ?? 0} previous={lastMonthSales._sum.total ?? 0} />
          </div>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Today&apos;s sales</p>
            <ChartLineUp size={18} className="text-green-600" aria-hidden="true" />
          </div>
          <p className="mt-1 text-lg sm:text-2xl font-semibold text-ink-900">{formatMoney(todaySales._sum.total ?? 0)}</p>
          <p className="text-xs text-stone-400">{todaySales._count} transaction(s)</p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Avg. sale (month)</p>
            <Wallet size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-lg sm:text-2xl font-semibold text-ink-900">{formatMoney(avgSaleThisMonth)}</p>
        </div>
        {teamTargetPercent !== null && (
          <Link href="/targets" className="card-interactive block">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Team target</p>
              <span className={`badge ${teamTargetPercent >= 100 ? "bg-green-100 text-green-700" : "bg-brand-100 text-brand-700"}`}>
                {teamTargetPercent}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className={`h-full rounded-full transition-all ${teamTargetPercent >= 100 ? "bg-green-600" : "bg-brand-500"}`}
                style={{ width: `${Math.min(teamTargetPercent, 100)}%` }}
              />
            </div>
          </Link>
        )}
        <Link href="/tasks?view=mine" className="stat-tile flex items-center gap-4 transition-shadow hover:shadow-card-hover">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50">
            <ListChecks size={22} className="text-brand-600" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-stone-500">Your open tasks</p>
            <p className="text-xl font-semibold text-ink-900">{myOpenTasks}</p>
          </div>
        </Link>
      </div>

      <ProjectsTasksWidget session={session} />

      <div className="card">
        <h2 className="section-title mb-1">Your sales trend</h2>
        <p className="mb-2 text-xs text-stone-500">Last 30 days</p>
        <SalesTrendChart data={trendData} />
      </div>

      <div className="card overflow-x-auto">
        <h2 className="section-title mb-3">Your recent sales</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Customer</th>
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
                <td>{formatMoney(s.total)}</td>
              </tr>
            ))}
            {recentSales.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-stone-400">
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

export default async function DashboardPage() {
  const session = await requireSessionOrRedirect();
  if (session.role === "SALES") {
    return <SalesStaffDashboard session={session} />;
  }
  const scope = branchScope(session);
  const today = startOfDay();
  const monthStart = startOfMonth();
  const lastMonthStart = startOfMonth(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const thirtyDaysAgo = startOfDay(new Date(today.getTime() - 29 * 86_400_000));

  const [
    todaySales,
    monthSales,
    lastMonthSales,
    monthLedger,
    lastMonthLedger,
    lowStockCandidates,
    myOpenTasks,
    recentSales,
    branchBreakdown,
    trendSales,
    newCustomersThisMonth,
    newCustomersLastMonth,
    outstanding,
    gemstoneItems,
    goldItems,
    silverItems,
    pendingRepairs,
    pendingLeave,
    attendanceToday,
    activeStaffCount,
    openPOs,
    activeTargets,
    brokerMemoItems,
  ] = await Promise.all([
    db.sale.aggregate({ where: { ...scope, createdAt: { gte: today } }, _sum: { total: true }, _count: true }),
    db.sale.aggregate({ where: { ...scope, createdAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
    db.sale.aggregate({
      where: { ...scope, createdAt: { gte: lastMonthStart, lt: monthStart } },
      _sum: { total: true },
    }),
    db.ledgerEntry.findMany({ where: { ...scope, date: { gte: monthStart } } }),
    db.ledgerEntry.findMany({ where: { ...scope, date: { gte: lastMonthStart, lt: monthStart } } }),
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
    isCompanyWide(session.roles)
      ? db.sale.groupBy({ by: ["branchId"], where: { createdAt: { gte: today } }, _sum: { total: true } })
      : Promise.resolve([]),
    db.sale.findMany({
      where: { ...scope, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, total: true },
    }),
    db.customer.count({ where: { ...scope, createdAt: { gte: monthStart } } }),
    db.customer.count({ where: { ...scope, createdAt: { gte: lastMonthStart, lt: monthStart } } }),
    db.sale.aggregate({
      where: { ...scope, paymentStatus: { in: ["UNPAID", "PARTIAL"] } },
      _sum: { total: true, amountPaid: true },
    }),
    db.inventoryItem.findMany({
      where: { ...scope, category: "LOOSE_STONE", status: "IN_STOCK" },
      select: { gemstoneType: true, quantity: true, costPrice: true, caratWeight: true },
    }),
    db.inventoryItem.findMany({
      where: { ...scope, metalType: "Gold", status: "IN_STOCK" },
      select: { category: true, quantity: true, costPrice: true, grossWeightG: true },
    }),
    db.inventoryItem.findMany({
      where: { ...scope, metalType: "Silver", status: "IN_STOCK" },
      select: { category: true, quantity: true, costPrice: true, grossWeightG: true },
    }),
    canManageRepairs(session.roles) || session.roles.includes("CRAFTSMAN")
      ? db.repairOrder.count({
          where: {
            ...(session.roles.includes("CRAFTSMAN") ? { assignedToId: session.staffId } : scope),
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
        })
      : Promise.resolve(null),
    canReviewLeave(session.roles)
      ? db.leaveRequest.count({
          where: { status: "PENDING", staff: isCompanyWide(session.roles) ? {} : { branchId: session.branchId } },
        })
      : Promise.resolve(null),
    canViewAttendance(session.roles)
      ? db.attendanceLog.findMany({ where: { ...scope, clockInAt: { gte: today } }, select: { staffId: true } })
      : Promise.resolve(null),
    canViewAttendance(session.roles) ? db.staff.count({ where: { ...scope, active: true } }) : Promise.resolve(null),
    canManagePurchasing(session.roles) || canManageAccounting(session.roles)
      ? db.purchaseOrder.aggregate({
          where: { ...scope, status: "ORDERED" },
          _sum: { totalAmount: true, amountPaid: true },
        })
      : Promise.resolve(null),
    db.salesTarget.findMany({
      where: {
        periodEnd: { gte: today },
        ...(canManageSalesTargets(session.roles) ? scope : { staffId: session.staffId }),
      },
    }),
    canManageBrokers(session.roles)
      ? db.brokerMemoItem.findMany({
          where: { memo: { ...scope, status: { not: "RETURNED" } } },
          select: { quantity: true, returnedQuantity: true, valueEach: true },
        })
      : Promise.resolve(null),
  ]);

  const lowStockItems = lowStockCandidates.filter((i) => i.quantity <= i.lowStockAt).length;
  const highStockItems = lowStockCandidates.length - lowStockItems;
  const monthIncome = monthLedger.filter((l) => l.type === "INCOME").reduce((s, l) => s + l.amount, 0);
  const monthExpense = monthLedger.filter((l) => l.type === "EXPENSE").reduce((s, l) => s + l.amount, 0);
  const lastMonthIncome = lastMonthLedger.filter((l) => l.type === "INCOME").reduce((s, l) => s + l.amount, 0);
  const lastMonthExpense = lastMonthLedger.filter((l) => l.type === "EXPENSE").reduce((s, l) => s + l.amount, 0);
  const avgSaleThisMonth = monthSales._count > 0 ? round2((monthSales._sum.total ?? 0) / monthSales._count) : 0;
  const outstandingAmount = round2((outstanding._sum.total ?? 0) - (outstanding._sum.amountPaid ?? 0));
  const customerDelta = newCustomersThisMonth - newCustomersLastMonth;

  const branches = branchBreakdown.length
    ? await db.branch.findMany({ where: { id: { in: branchBreakdown.map((b) => b.branchId) } } })
    : [];

  // 30-day sales trend, bucketed by local calendar day, zero-filled.
  const trendMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo.getTime() + i * 86_400_000);
    trendMap.set(dayKey(d), 0);
  }
  for (const sale of trendSales) {
    const key = dayKey(sale.createdAt);
    trendMap.set(key, (trendMap.get(key) ?? 0) + sale.total);
  }
  const trendData = Array.from(trendMap.entries()).map(([date, total]) => ({ date, total: round2(total) }));

  const gemstoneBreakdown = rankedBreakdown(
    gemstoneItems,
    (i) => i.gemstoneType ?? "Unspecified",
    (i) => i.quantity,
    (i) => i.costPrice * i.quantity,
  );
  const gemstoneCount = gemstoneItems.reduce((s, i) => s + i.quantity, 0);
  const gemstoneCarats = round2(gemstoneItems.reduce((s, i) => s + (i.caratWeight ?? 0) * i.quantity, 0));
  const gemstoneValue = round2(gemstoneItems.reduce((s, i) => s + i.costPrice * i.quantity, 0));

  const goldBreakdown = rankedBreakdown(
    goldItems,
    (i) => i.category.replace("_", " "),
    (i) => i.quantity,
    (i) => i.costPrice * i.quantity,
  );
  const goldCount = goldItems.reduce((s, i) => s + i.quantity, 0);
  const goldWeight = round2(goldItems.reduce((s, i) => s + (i.grossWeightG ?? 0) * i.quantity, 0));
  const goldValue = round2(goldItems.reduce((s, i) => s + i.costPrice * i.quantity, 0));

  const silverBreakdown = rankedBreakdown(
    silverItems,
    (i) => i.category.replace("_", " "),
    (i) => i.quantity,
    (i) => i.costPrice * i.quantity,
  );
  const silverCount = silverItems.reduce((s, i) => s + i.quantity, 0);
  const silverWeight = round2(silverItems.reduce((s, i) => s + (i.grossWeightG ?? 0) * i.quantity, 0));
  const silverValue = round2(silverItems.reduce((s, i) => s + i.costPrice * i.quantity, 0));

  const targetsWithProgress = await Promise.all(
    activeTargets.map(async (t) => {
      const achieved = await db.sale.aggregate({
        where: { staffId: t.staffId, createdAt: { gte: t.periodStart, lte: t.periodEnd } },
        _sum: { total: true },
      });
      return { target: t.targetAmount, achieved: achieved._sum.total ?? 0 };
    }),
  );
  const targetSum = targetsWithProgress.reduce((s, t) => s + t.target, 0);
  const targetAchievedSum = targetsWithProgress.reduce((s, t) => s + t.achieved, 0);
  const targetPercent = targetSum > 0 ? Math.round((targetAchievedSum / targetSum) * 100) : null;

  const attendanceTodayCount = attendanceToday ? new Set(attendanceToday.map((a) => a.staffId)).size : null;
  const openPOBalance = openPOs ? round2((openPOs._sum.totalAmount ?? 0) - (openPOs._sum.amountPaid ?? 0)) : null;

  const brokerOutstandingCount = brokerMemoItems
    ? brokerMemoItems.reduce((s, i) => s + (i.quantity - i.returnedQuantity), 0)
    : null;
  const brokerOutstandingValue = brokerMemoItems
    ? round2(brokerMemoItems.reduce((s, i) => s + (i.quantity - i.returnedQuantity) * i.valueEach, 0))
    : null;

  return (
    <div className="space-y-6">
      <h1 className="page-title">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="stat-tile-highlight col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">Total sales · this month</p>
            <Receipt size={18} className="text-white/70" aria-hidden="true" />
          </div>
          <p className="mt-1 text-2xl font-semibold sm:text-3xl">{formatMoney(monthSales._sum.total ?? 0)}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/70">
            <span>{monthSales._count} sale(s)</span>
            <TrendBadge current={monthSales._sum.total ?? 0} previous={lastMonthSales._sum.total ?? 0} />
          </div>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Today&apos;s sales</p>
            <Sparkle size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-lg sm:text-2xl font-semibold text-ink-900">{formatMoney(todaySales._sum.total ?? 0)}</p>
          <p className="text-xs text-stone-400">{todaySales._count} transaction(s)</p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Avg. sale (month)</p>
            <Wallet size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-lg sm:text-2xl font-semibold text-ink-900">{formatMoney(avgSaleThisMonth)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Month income</p>
            <ChartLineUp size={18} className="text-green-600" aria-hidden="true" />
          </div>
          <p className="mt-1 text-lg sm:text-2xl font-semibold text-green-700">{formatMoney(monthIncome)}</p>
          <TrendBadge current={monthIncome} previous={lastMonthIncome} goodDirection="up" />
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Month expenses</p>
            <ChartLineDown size={18} className="text-red-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-lg sm:text-2xl font-semibold text-red-700">{formatMoney(monthExpense)}</p>
          <TrendBadge current={monthExpense} previous={lastMonthExpense} goodDirection="down" />
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Net this month</p>
            <Sparkle size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p
            className={`mt-1 text-lg sm:text-2xl font-semibold ${
              monthIncome - monthExpense >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            {formatMoney(monthIncome - monthExpense)}
          </p>
          <TrendBadge current={monthIncome - monthExpense} previous={lastMonthIncome - lastMonthExpense} goodDirection="up" />
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Outstanding</p>
            <Receipt size={18} className="text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-1 text-lg sm:text-2xl font-semibold text-amber-700">{formatMoney(outstandingAmount)}</p>
          <p className="text-xs text-stone-400">unpaid / partial invoices</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">New customers</p>
            <UsersThree size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p className="text-xl font-semibold text-ink-900 sm:text-2xl">
            {newCustomersThisMonth}
            {customerDelta !== 0 && (
              <span className={`ml-2 text-sm font-medium ${customerDelta > 0 ? "text-green-600" : "text-red-600"}`}>
                {customerDelta > 0 ? "+" : ""}
                {customerDelta} vs last month
              </span>
            )}
          </p>
        </div>
        {targetPercent !== null && (
          <Link href="/targets" className="card-interactive block">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                {canManageSalesTargets(session.roles) ? "Team target" : "Your target"}
              </p>
              <span className={`badge ${targetPercent >= 100 ? "bg-green-100 text-green-700" : "bg-brand-100 text-brand-700"}`}>
                {targetPercent}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className={`h-full rounded-full transition-all ${targetPercent >= 100 ? "bg-green-600" : "bg-brand-500"}`}
                style={{ width: `${Math.min(targetPercent, 100)}%` }}
              />
            </div>
          </Link>
        )}
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Stock info</h2>
          <Link href="/inventory?status=IN_STOCK" className="text-xs font-medium text-brand-700 hover:underline">
            View inventory →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xl font-semibold text-ink-900 sm:text-2xl">{lowStockCandidates.length}</p>
            <p className="text-xs text-stone-500">Active products</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-green-700 sm:text-2xl">{highStockItems}</p>
            <p className="text-xs text-stone-500">High stock</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-amber-700 sm:text-2xl">{lowStockItems}</p>
            <p className="text-xs text-stone-500">Near-low stock</p>
          </div>
        </div>
        {lowStockCandidates.length > 0 && (
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full bg-green-500"
              style={{ width: `${(highStockItems / lowStockCandidates.length) * 100}%` }}
              title={`${highStockItems} high stock`}
            />
            <div
              className="h-full bg-amber-500"
              style={{ width: `${(lowStockItems / lowStockCandidates.length) * 100}%` }}
              title={`${lowStockItems} near-low stock`}
            />
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="section-title mb-1">Sales trend</h2>
        <p className="mb-2 text-xs text-stone-500">Last 30 days</p>
        <SalesTrendChart data={trendData} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
              <Diamond size={16} weight="fill" className="text-purple-600" aria-hidden="true" />
            </span>
            <h2 className="section-title">Gemstones</h2>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-semibold text-ink-900">{gemstoneCount}</p>
              <p className="text-[11px] text-stone-500">stones</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink-900">{gemstoneCarats}</p>
              <p className="text-[11px] text-stone-500">carats</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink-900">{formatMoney(gemstoneValue)}</p>
              <p className="text-[11px] text-stone-500">stock value</p>
            </div>
          </div>
          <RankedBarChart
            data={gemstoneBreakdown.map((r) => ({
              label: r.label,
              value: r.count,
              secondaryLabel: formatMoney(r.value),
            }))}
          />
        </div>

        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Crown size={16} weight="fill" className="text-amber-600" aria-hidden="true" />
            </span>
            <h2 className="section-title">Gold Jewelry</h2>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-semibold text-ink-900">{goldCount}</p>
              <p className="text-[11px] text-stone-500">pieces</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink-900">{goldWeight}g</p>
              <p className="text-[11px] text-stone-500">weight</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink-900">{formatMoney(goldValue)}</p>
              <p className="text-[11px] text-stone-500">stock value</p>
            </div>
          </div>
          <RankedBarChart
            data={goldBreakdown.map((r) => ({
              label: r.label,
              value: r.count,
              secondaryLabel: formatMoney(r.value),
            }))}
          />
        </div>

        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <Sparkle size={16} weight="fill" className="text-slate-600" aria-hidden="true" />
            </span>
            <h2 className="section-title">Silver Jewelry</h2>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-semibold text-ink-900">{silverCount}</p>
              <p className="text-[11px] text-stone-500">pieces</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink-900">{silverWeight}g</p>
              <p className="text-[11px] text-stone-500">weight</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink-900">{formatMoney(silverValue)}</p>
              <p className="text-[11px] text-stone-500">stock value</p>
            </div>
          </div>
          <RankedBarChart
            data={silverBreakdown.map((r) => ({
              label: r.label,
              value: r.count,
              secondaryLabel: formatMoney(r.value),
            }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link href="/tasks?view=mine" className="card-interactive flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50">
            <ListChecks size={22} className="text-brand-600" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-stone-500">Your open tasks</p>
            <p className="text-xl font-semibold text-ink-900">{myOpenTasks}</p>
          </div>
        </Link>
        {pendingRepairs !== null && (
          <Link href="/repairs" className="card-interactive flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-50">
              <Wrench size={22} className="text-orange-600" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-stone-500">Open repairs</p>
              <p className="text-xl font-semibold text-ink-900">{pendingRepairs}</p>
            </div>
          </Link>
        )}
        {pendingLeave !== null && (
          <Link href="/leave" className="card-interactive flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50">
              <CalendarCheck size={22} className="text-blue-600" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-stone-500">Leave awaiting review</p>
              <p className="text-xl font-semibold text-ink-900">{pendingLeave}</p>
            </div>
          </Link>
        )}
        {attendanceTodayCount !== null && (
          <Link href="/attendance" className="card-interactive flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-50">
              <ClockCountdown size={22} className="text-green-600" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-stone-500">Clocked in today</p>
              <p className="text-xl font-semibold text-ink-900">
                {attendanceTodayCount}
                <span className="text-sm font-normal text-stone-400">/{activeStaffCount}</span>
              </p>
            </div>
          </Link>
        )}
        {openPOBalance !== null && (
          <Link href="/purchasing" className="card-interactive flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-50">
              <Truck size={22} className="text-purple-600" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-stone-500">Owed to suppliers</p>
              <p className="text-xl font-semibold text-ink-900">{formatMoney(openPOBalance)}</p>
            </div>
          </Link>
        )}
        {brokerOutstandingValue !== null && (
          <Link href="/brokers" className="card-interactive flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-50">
              <Handshake size={22} className="text-rose-600" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-stone-500">With brokers</p>
              <p className="text-xl font-semibold text-ink-900">{formatMoney(brokerOutstandingValue)}</p>
              <p className="text-xs text-stone-400">{brokerOutstandingCount} stone(s) out</p>
            </div>
          </Link>
        )}
      </div>

      <ProjectsTasksWidget session={session} />

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
