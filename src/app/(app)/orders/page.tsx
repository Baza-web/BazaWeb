import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { isCompanyWide, canManageOrdersScoped, canManageOrdersCompanyWide, canCreateOrders } from "@/lib/rbac";
import {
  getOrderPrioritySettings,
  computeAutoPriority,
  daysRemaining,
  daysOverdue,
  overdueWhere,
  dueWithinHoursWhere,
  criticalWhere,
  highPriorityWhere,
  openOrderWhere,
  PRIORITY_STYLES,
  PRIORITY_LABELS,
} from "@/lib/orderPriority";
import { ORDER_STATUS_STYLES, ORDER_STATUS_LABELS } from "./shared";
import { formatDate } from "@/lib/utils";
import { updatePrioritySettings } from "./actions";
import { ClipboardText, WarningCircle, Clock, CheckCircle, ArrowRight, Plus } from "@/components/icons";
import { RankedBarChart } from "@/components/RankedBarChart";
import { OrderVolumeChart } from "@/components/OrderVolumeChart";

export default async function OrdersCommandCentrePage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const { brand: brandFilter } = await searchParams;

  const manageScoped = canManageOrdersScoped(session.roles);
  const manageCompanyWide = canManageOrdersCompanyWide(session.roles);

  const scopeWhere = manageScoped
    ? isCompanyWide(session.roles)
      ? {}
      : { branchId: session.branchId ?? undefined }
    : { OR: [{ primaryStaffId: session.staffId }, { supportingStaff: { some: { id: session.staffId } } }] };

  const brandWhere = brandFilter && brandFilter !== "ALL" ? { brandId: brandFilter } : {};
  const where = { ...scopeWhere, ...brandWhere };

  const settings = await getOrderPrioritySettings();
  const now = new Date();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const noProgressThreshold = new Date(now.getTime() - 3 * 86_400_000);

  const [
    totalOrders,
    activeOrders,
    newOrders,
    inProgress,
    dueTodayCount,
    due24hCount,
    due48hCount,
    criticalCount,
    highCount,
    overdueCount,
    delayedCount,
    awaitingApprovalCount,
    completedCount,
    onHoldCount,
    brands,
    allScopedOrders,
    overdueList,
    dueTodayList,
    due24hList,
    noRecentProgressList,
  ] = await Promise.all([
    db.order.count({ where }),
    db.order.count({ where: { ...where, ...openOrderWhere() } }),
    db.order.count({ where: { ...where, status: "NEW_ORDER" } }),
    db.order.count({ where: { ...where, status: "IN_PROGRESS" } }),
    db.order.count({ where: { ...where, ...openOrderWhere(), currentDeadline: { gte: now, lte: todayEnd } } }),
    db.order.count({ where: { ...where, ...dueWithinHoursWhere(24, now) } }),
    db.order.count({ where: { ...where, ...dueWithinHoursWhere(48, now) } }),
    db.order.count({ where: { ...where, ...criticalWhere(settings, now) } }),
    db.order.count({ where: { ...where, ...highPriorityWhere(settings, now) } }),
    db.order.count({ where: { ...where, ...overdueWhere(now) } }),
    db.order.count({ where: { ...where, ...openOrderWhere(), delays: { some: {} } } }),
    db.order.count({ where: { ...where, approvals: { some: { decision: null } } } }),
    db.order.count({ where: { ...where, status: "COMPLETED" } }),
    db.order.count({ where: { ...where, status: "ON_HOLD" } }),
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.order.findMany({
      where,
      select: {
        brandId: true,
        brand: { select: { name: true } },
        department: true,
        primaryStaffId: true,
        primaryStaff: { select: { name: true } },
        status: true,
        completedAt: true,
        currentDeadline: true,
        createdAt: true,
      },
      take: 3000,
    }),
    db.order.findMany({
      where: { ...where, ...overdueWhere(now) },
      include: { primaryStaff: true, brand: true },
      orderBy: { currentDeadline: "asc" },
      take: 8,
    }),
    db.order.findMany({
      where: { ...where, ...openOrderWhere(), currentDeadline: { gte: now, lte: todayEnd } },
      include: { primaryStaff: true, brand: true },
      orderBy: { currentDeadline: "asc" },
      take: 8,
    }),
    db.order.findMany({
      where: { ...where, ...dueWithinHoursWhere(24, now) },
      include: { primaryStaff: true, brand: true },
      orderBy: { currentDeadline: "asc" },
      take: 8,
    }),
    db.order.findMany({
      where: { ...where, ...openOrderWhere(), updatedAt: { lt: noProgressThreshold } },
      include: { primaryStaff: true, brand: true },
      orderBy: { updatedAt: "asc" },
      take: 8,
    }),
  ]);

  const byBrand = new Map<string, number>();
  const byDepartment = new Map<string, number>();
  const byEmployee = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const monthly = new Map<string, number>();
  let onTime = 0;
  let delayedCompletions = 0;

  for (const o of allScopedOrders) {
    const brandLabel = o.brand?.name ?? "No brand";
    byBrand.set(brandLabel, (byBrand.get(brandLabel) ?? 0) + 1);
    const deptLabel = o.department?.trim() || "Unassigned";
    byDepartment.set(deptLabel, (byDepartment.get(deptLabel) ?? 0) + 1);
    const empLabel = o.primaryStaff?.name ?? "Unassigned";
    byEmployee.set(empLabel, (byEmployee.get(empLabel) ?? 0) + 1);
    byStatus.set(ORDER_STATUS_LABELS[o.status], (byStatus.get(ORDER_STATUS_LABELS[o.status]) ?? 0) + 1);

    const monthKey = o.createdAt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    monthly.set(monthKey, (monthly.get(monthKey) ?? 0) + 1);

    if (o.status === "COMPLETED" && o.completedAt) {
      if (o.completedAt.getTime() <= o.currentDeadline.getTime()) onTime++;
      else delayedCompletions++;
    }
  }

  const toRows = (m: Map<string, number>, limit = 8) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label, value]) => ({ label, value }));

  const monthlyRows = Array.from(monthly.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-12)
    .map(([month, count]) => ({ month, count }));

  const onTimeVsDelayed = [
    { label: "On-time", value: onTime },
    { label: "Delayed", value: delayedCompletions },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardText size={26} className="text-brand-500" aria-hidden="true" />
            Order Command Centre
          </h1>
          <p className="text-sm text-stone-500">
            {manageCompanyWide ? "Every order across every brand and branch." : manageScoped ? "Orders in your branch." : "Orders assigned to you."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-2">
            <select className="input text-sm" name="brand" defaultValue={brandFilter ?? "ALL"}>
              <option value="ALL">All Brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-secondary text-sm">
              Apply
            </button>
          </form>
          {canCreateOrders(session.roles) && (
            <Link href="/orders/new" className="btn-primary text-sm">
              <Plus size={16} aria-hidden="true" /> Create New Order
            </Link>
          )}
          <Link href="/orders/all" className="btn-secondary text-sm">
            All Orders <ArrowRight size={16} aria-hidden="true" />
          </Link>
          {canManageOrdersCompanyWide(session.roles) && (
            <Link href="/orders/qc-settings" className="btn-secondary text-sm">
              QC Settings
            </Link>
          )}
          <Link href="/workshop" className="btn-secondary text-sm">
            Workshop &amp; Supplies
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        <StatTile label="Total Orders" value={totalOrders} />
        <StatTile label="Active Orders" value={activeOrders} />
        <StatTile label="New Orders" value={newOrders} />
        <StatTile label="In Progress" value={inProgress} />
        <StatTile label="Due Today" value={dueTodayCount} tone="amber" />
        <StatTile label="Due in 24h" value={due24hCount} tone="amber" />
        <StatTile label="Due in 48h" value={due48hCount} tone="amber" />
        <StatTile label="Critical" value={criticalCount} tone="red" />
        <StatTile label="High" value={highCount} tone="amber" />
        <StatTile label="Overdue" value={overdueCount} tone="red" />
        <StatTile label="Delayed" value={delayedCount} tone="red" />
        <StatTile label="Awaiting Approval" value={awaitingApprovalCount} tone="blue" />
        <StatTile label="Completed" value={completedCount} tone="green" />
        <StatTile label="On Hold" value={onHoldCount} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <PrioritySection title="Overdue Orders" icon={<WarningCircle size={18} className="text-red-600" aria-hidden="true" />} orders={overdueList} settings={settings} emptyText="Nothing overdue." />
        <PrioritySection title="Due Today" icon={<Clock size={18} className="text-amber-600" aria-hidden="true" />} orders={dueTodayList} settings={settings} emptyText="Nothing due today." />
        <PrioritySection title="Due Within 24 Hours" icon={<Clock size={18} className="text-amber-600" aria-hidden="true" />} orders={due24hList} settings={settings} emptyText="Nothing critical right now." />
        <PrioritySection title="No Recent Progress" icon={<WarningCircle size={18} className="text-stone-500" aria-hidden="true" />} orders={noRecentProgressList} settings={settings} emptyText="Everything has moved recently." showUpdated />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="section-title mb-3">Orders by Brand</h2>
          <RankedBarChart data={toRows(byBrand)} />
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Orders by Department</h2>
          <RankedBarChart data={toRows(byDepartment)} />
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Orders by Employee</h2>
          <RankedBarChart data={toRows(byEmployee)} />
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Orders by Status</h2>
          <RankedBarChart data={toRows(byStatus, 15)} />
        </div>
        <div className="card">
          <h2 className="section-title mb-3">On-Time vs Delayed (Completed Orders)</h2>
          <RankedBarChart data={onTimeVsDelayed} />
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Monthly Order Volume</h2>
          <OrderVolumeChart data={monthlyRows} />
        </div>
      </div>

      {manageCompanyWide && (
        <div className="card max-w-xl">
          <h2 className="section-title mb-3">Urgency thresholds</h2>
          <p className="mb-3 text-sm text-stone-500">
            Controls when an order becomes Critical, High or Medium priority automatically.
          </p>
          <form action={updatePrioritySettings} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Critical within (hours)</label>
              <input className="input" type="number" min="1" name="criticalHours" defaultValue={settings.criticalHours} />
            </div>
            <div>
              <label className="label">High within (hours)</label>
              <input className="input" type="number" min="1" name="highHours" defaultValue={settings.highHours} />
            </div>
            <div>
              <label className="label">Medium within (days)</label>
              <input className="input" type="number" min="1" name="mediumDays" defaultValue={settings.mediumDays} />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn-secondary text-sm">
                Save thresholds
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: "amber" | "red" | "green" | "blue" }) {
  const toneClass =
    tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : tone === "green" ? "text-green-700" : tone === "blue" ? "text-blue-700" : "text-ink-900";
  return (
    <div className="stat-tile">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`mt-1 text-xl sm:text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function PrioritySection({
  title,
  icon,
  orders,
  settings,
  emptyText,
  showUpdated,
}: {
  title: string;
  icon: React.ReactNode;
  orders: { id: string; orderNumber: string; productOrService: string; currentDeadline: Date; status: string; updatedAt?: Date; primaryStaff: { name: string }; brand: { name: string } | null }[];
  settings: { criticalHours: number; highHours: number; mediumDays: number };
  emptyText: string;
  showUpdated?: boolean;
}) {
  return (
    <div className="card">
      <h2 className="section-title mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {orders.length === 0 ? (
        <p className="text-sm text-stone-400">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {orders.map((o) => {
            const priority = computeAutoPriority(o.currentDeadline, o.status as never, settings);
            const overdue = daysOverdue(o.currentDeadline);
            return (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-2 py-2 hover:bg-stone-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{o.productOrService}</p>
                    <p className="text-xs text-stone-500">
                      {o.orderNumber} · {o.primaryStaff.name}
                      {o.brand ? ` · ${o.brand.name}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {priority && <span className={`badge ${PRIORITY_STYLES[priority]}`}>{PRIORITY_LABELS[priority]}</span>}
                    <p className="mt-0.5 text-xs text-stone-400">
                      {showUpdated && o.updatedAt ? `Updated ${formatDate(o.updatedAt)}` : overdue > 0 ? `${overdue}d overdue` : formatDate(o.currentDeadline)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
