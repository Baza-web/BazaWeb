import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { isCompanyWide, canManageOrdersScoped } from "@/lib/rbac";
import { overdueWhere, openOrderWhere } from "@/lib/orderPriority";
import { ORDER_STATUS_LABELS } from "../shared";
import { ChartPie, DownloadSimple } from "@/components/icons";
import { RankedBarChart } from "@/components/RankedBarChart";
import { OrderVolumeChart } from "@/components/OrderVolumeChart";
import type { Prisma } from "@prisma/client";

export default async function OrderReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; from?: string; to?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canManageOrdersScoped(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }
  const { brand, from, to } = await searchParams;

  const scopeWhere: Prisma.OrderWhereInput = isCompanyWide(session.roles) ? {} : { branchId: session.branchId ?? undefined };
  const brandWhere: Prisma.OrderWhereInput = brand ? { brandId: brand } : {};
  const dateWhere: Prisma.OrderWhereInput =
    from || to ? { orderDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to + "T23:59:59") } : {}) } } : {};
  const where: Prisma.OrderWhereInput = { ...scopeWhere, ...brandWhere, ...dateWhere };

  const [brands, orders, overdueCount, awaitingApprovalCount, delayedCount] = await Promise.all([
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.order.findMany({
      where,
      select: {
        brand: { select: { name: true } },
        department: true,
        primaryStaff: { select: { name: true } },
        status: true,
        completedAt: true,
        currentDeadline: true,
        createdAt: true,
        orderDate: true,
      },
      take: 5000,
    }),
    db.order.count({ where: { ...where, ...overdueWhere() } }),
    db.order.count({ where: { ...where, approvals: { some: { decision: null } } } }),
    db.order.count({ where: { ...where, ...openOrderWhere(), delays: { some: {} } } }),
  ]);

  const byBrand = new Map<string, number>();
  const byEmployee = new Map<string, number>();
  const byDepartment = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const monthly = new Map<string, number>();
  let onTime = 0;
  let delayedCompletions = 0;
  let totalCompletionDays = 0;
  let completionSamples = 0;

  for (const o of orders) {
    byBrand.set(o.brand?.name ?? "No brand", (byBrand.get(o.brand?.name ?? "No brand") ?? 0) + 1);
    byEmployee.set(o.primaryStaff.name, (byEmployee.get(o.primaryStaff.name) ?? 0) + 1);
    byDepartment.set(o.department?.trim() || "Unassigned", (byDepartment.get(o.department?.trim() || "Unassigned") ?? 0) + 1);
    byStatus.set(ORDER_STATUS_LABELS[o.status], (byStatus.get(ORDER_STATUS_LABELS[o.status]) ?? 0) + 1);
    const monthKey = o.createdAt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    monthly.set(monthKey, (monthly.get(monthKey) ?? 0) + 1);

    if (o.status === "COMPLETED" && o.completedAt) {
      if (o.completedAt.getTime() <= o.currentDeadline.getTime()) onTime++;
      else delayedCompletions++;
      totalCompletionDays += (o.completedAt.getTime() - o.orderDate.getTime()) / 86_400_000;
      completionSamples++;
    }
  }

  const toRows = (m: Map<string, number>, limit = 10) =>
    Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, value]) => ({ label, value }));

  const monthlyRows = Array.from(monthly.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-12).map(([month, count]) => ({ month, count }));
  const completedTotal = onTime + delayedCompletions;
  const onTimeRate = completedTotal > 0 ? Math.round((onTime / completedTotal) * 100) : 0;
  const avgCompletionDays = completionSamples > 0 ? (totalCompletionDays / completionSamples).toFixed(1) : "—";

  const exportQs = new URLSearchParams();
  if (brand) exportQs.set("brand", brand);
  if (from) exportQs.set("from", from);
  if (to) exportQs.set("to", to);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title flex items-center gap-2">
          <ChartPie size={26} className="text-brand-500" aria-hidden="true" />
          Order Reports
        </h1>
        <div className="flex items-center gap-2">
          <a href={`/api/export/orders?${exportQs.toString()}&format=xlsx`} className="btn-secondary text-sm">
            <DownloadSimple size={16} aria-hidden="true" /> Excel
          </a>
          <a href={`/api/export/orders?${exportQs.toString()}&format=csv`} className="btn-secondary text-sm">
            <DownloadSimple size={16} aria-hidden="true" /> CSV
          </a>
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Brand</label>
          <select className="input text-sm" name="brand" defaultValue={brand ?? ""}>
            <option value="">All Brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input className="input text-sm" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input text-sm" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <button type="submit" className="btn-secondary text-sm">Apply</button>
      </form>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="stat-tile">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">On-Time Completion</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">{onTimeRate}%</p>
        </div>
        <div className="stat-tile">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Avg. Completion Time</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">{avgCompletionDays}{completionSamples > 0 ? "d" : ""}</p>
        </div>
        <div className="stat-tile">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Overdue</p>
          <p className="mt-1 text-xl font-semibold text-red-700">{overdueCount}</p>
        </div>
        <div className="stat-tile">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Delayed</p>
          <p className="mt-1 text-xl font-semibold text-red-700">{delayedCount}</p>
        </div>
        <div className="stat-tile">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Awaiting Approval</p>
          <p className="mt-1 text-xl font-semibold text-blue-700">{awaitingApprovalCount}</p>
        </div>
        <div className="stat-tile">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Total Orders</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">{orders.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="section-title mb-3">Orders by Brand</h2>
          <RankedBarChart data={toRows(byBrand)} />
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Employee Workload</h2>
          <RankedBarChart data={toRows(byEmployee)} />
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Orders by Department</h2>
          <RankedBarChart data={toRows(byDepartment)} />
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Orders by Status</h2>
          <RankedBarChart data={toRows(byStatus, 15)} />
        </div>
        <div className="card lg:col-span-2">
          <h2 className="section-title mb-3">Monthly Order Volume</h2>
          <OrderVolumeChart data={monthlyRows} />
        </div>
      </div>
    </div>
  );
}
