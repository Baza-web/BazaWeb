import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { isCompanyWide, canManageOrdersScoped } from "@/lib/rbac";
import { openOrderWhere, daysRemaining } from "@/lib/orderPriority";
import { ORDER_STATUS_STYLES, ORDER_STATUS_LABELS } from "../shared";
import { formatDate } from "@/lib/utils";
import { CalendarCheck } from "@/components/icons";
import type { Prisma } from "@prisma/client";

export default async function UpcomingDeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; employee?: string; department?: string; view?: string; month?: string; from?: string; to?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const manageScoped = canManageOrdersScoped(session.roles);
  const params = await searchParams;

  const scopeWhere: Prisma.OrderWhereInput = manageScoped
    ? isCompanyWide(session.roles)
      ? {}
      : { branchId: session.branchId ?? undefined }
    : { OR: [{ primaryStaffId: session.staffId }, { supportingStaff: { some: { id: session.staffId } } }] };

  const filters: Prisma.OrderWhereInput[] = [scopeWhere, openOrderWhere()];
  if (params.brand) filters.push({ brandId: params.brand });
  if (params.employee) filters.push({ OR: [{ primaryStaffId: params.employee }, { supportingStaff: { some: { id: params.employee } } }] });
  if (params.department) filters.push({ department: params.department });
  const where: Prisma.OrderWhereInput = { AND: filters };

  const [brands, staffList, departmentRows] = await Promise.all([
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    isCompanyWide(session.roles)
      ? db.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } })
      : db.staff.findMany({ where: { active: true, branchId: session.branchId ?? undefined }, orderBy: { name: "asc" } }),
    db.order.findMany({ where: { department: { not: null } }, select: { department: true }, distinct: ["department"] }),
  ]);
  const departments = departmentRows.map((d) => d.department).filter(Boolean) as string[];

  const view = params.view === "calendar" ? "calendar" : "list";
  const now = new Date();

  if (view === "calendar") {
    const [y, m] = (params.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`).split("-").map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);
    const monthOrders = await db.order.findMany({
      where: { ...where, currentDeadline: { gte: monthStart, lte: monthEnd } },
      select: { id: true, orderNumber: true, productOrService: true, currentDeadline: true },
    });
    const byDay = new Map<number, typeof monthOrders>();
    for (const o of monthOrders) {
      const day = o.currentDeadline.getDate();
      byDay.set(day, [...(byDay.get(day) ?? []), o]);
    }
    const daysInMonth = monthEnd.getDate();
    const startWeekday = monthStart.getDay();
    const prevMonth = new Date(y, m - 2, 1);
    const nextMonth = new Date(y, m, 1);

    return (
      <div className="space-y-6">
        <PageHeader brands={brands} staffList={staffList} departments={departments} params={params} view={view} />
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <Link href={qs(params, { month: `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}` })} className="btn-secondary text-sm">← Prev</Link>
            <h2 className="font-display text-lg font-semibold">{monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
            <Link href={qs(params, { month: `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}` })} className="btn-secondary text-sm">Next →</Link>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: startWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayOrders = byDay.get(day) ?? [];
              return (
                <div key={day} className="min-h-[72px] rounded-lg border border-stone-100 p-1 text-left">
                  <p className="text-xs text-stone-400">{day}</p>
                  {dayOrders.slice(0, 2).map((o) => (
                    <Link key={o.id} href={`/orders/${o.id}`} className="mt-0.5 block truncate rounded bg-brand-50 px-1 text-[10px] text-brand-700 hover:bg-brand-100">
                      {o.orderNumber}
                    </Link>
                  ))}
                  {dayOrders.length > 2 && <p className="text-[10px] text-stone-400">+{dayOrders.length - 2} more</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const tomorrowStart = new Date(todayEnd.getTime() + 1); const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999);
  const h48 = new Date(now.getTime() + 48 * 3_600_000);
  const d7 = new Date(now.getTime() + 7 * 86_400_000);
  const d30 = new Date(now.getTime() + 30 * 86_400_000);

  const customFrom = params.from ? new Date(params.from) : undefined;
  const customTo = params.to ? new Date(params.to) : undefined;

  const [dueToday, dueTomorrow, due48h, due7d, due30d, customRange] = await Promise.all([
    db.order.findMany({ where: { ...where, currentDeadline: { gte: now, lte: todayEnd } }, include: { brand: true, primaryStaff: true }, orderBy: { currentDeadline: "asc" } }),
    db.order.findMany({ where: { ...where, currentDeadline: { gte: tomorrowStart, lte: tomorrowEnd } }, include: { brand: true, primaryStaff: true }, orderBy: { currentDeadline: "asc" } }),
    db.order.findMany({ where: { ...where, currentDeadline: { gte: now, lte: h48 } }, include: { brand: true, primaryStaff: true }, orderBy: { currentDeadline: "asc" } }),
    db.order.findMany({ where: { ...where, currentDeadline: { gte: now, lte: d7 } }, include: { brand: true, primaryStaff: true }, orderBy: { currentDeadline: "asc" } }),
    db.order.findMany({ where: { ...where, currentDeadline: { gte: now, lte: d30 } }, include: { brand: true, primaryStaff: true }, orderBy: { currentDeadline: "asc" } }),
    customFrom && customTo
      ? db.order.findMany({ where: { ...where, currentDeadline: { gte: customFrom, lte: customTo } }, include: { brand: true, primaryStaff: true }, orderBy: { currentDeadline: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader brands={brands} staffList={staffList} departments={departments} params={params} view={view} />

      <div className="card">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="view" value="list" />
          {params.brand && <input type="hidden" name="brand" value={params.brand} />}
          {params.employee && <input type="hidden" name="employee" value={params.employee} />}
          {params.department && <input type="hidden" name="department" value={params.department} />}
          <div>
            <label className="label">From</label>
            <input className="input text-sm" type="date" name="from" defaultValue={params.from ?? ""} />
          </div>
          <div>
            <label className="label">To</label>
            <input className="input text-sm" type="date" name="to" defaultValue={params.to ?? ""} />
          </div>
          <button type="submit" className="btn-secondary text-sm">Custom range</button>
        </form>
        {customFrom && customTo && <OrderBucket title={`${formatDate(customFrom)} – ${formatDate(customTo)}`} orders={customRange} />}
      </div>

      <OrderBucket title="Due Today" orders={dueToday} />
      <OrderBucket title="Due Tomorrow" orders={dueTomorrow} />
      <OrderBucket title="Next 48 Hours" orders={due48h} />
      <OrderBucket title="Next 7 Days" orders={due7d} />
      <OrderBucket title="Next 30 Days" orders={due30d} />
    </div>
  );
}

function qs(params: Record<string, string | undefined>, overrides: Record<string, string | undefined>) {
  const merged = { ...params, ...overrides };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  return `?${sp.toString()}`;
}

function PageHeader({
  brands,
  staffList,
  departments,
  params,
  view,
}: {
  brands: { id: string; name: string }[];
  staffList: { id: string; name: string }[];
  departments: string[];
  params: Record<string, string | undefined>;
  view: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <CalendarCheck size={26} className="text-brand-500" aria-hidden="true" />
          Upcoming Deadlines
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={qs(params, { view: "list" })} className={`btn-secondary text-sm ${view === "list" ? "bg-stone-200" : ""}`}>List</Link>
        <Link href={qs(params, { view: "calendar" })} className={`btn-secondary text-sm ${view === "calendar" ? "bg-stone-200" : ""}`}>Calendar</Link>
      </div>
      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="view" value={view} />
        <select className="input text-sm" name="brand" defaultValue={params.brand ?? ""}>
          <option value="">All Brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="input text-sm" name="employee" defaultValue={params.employee ?? ""}>
          <option value="">All employees</option>
          {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input text-sm" name="department" defaultValue={params.department ?? ""}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button type="submit" className="btn-secondary text-sm">Filter</button>
      </form>
    </div>
  );
}

function OrderBucket({ title, orders }: { title: string; orders: { id: string; orderNumber: string; productOrService: string; currentDeadline: Date; status: string; brand: { name: string } | null; primaryStaff: { name: string } }[] }) {
  return (
    <div className="card">
      <h2 className="section-title mb-3">{title} <span className="text-stone-400">({orders.length})</span></h2>
      {orders.length === 0 ? (
        <p className="text-sm text-stone-400">Nothing in this window.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-stone-50">
                <div>
                  <p className="text-sm font-medium text-ink-900">{o.productOrService}</p>
                  <p className="text-xs text-stone-500">{o.orderNumber} · {o.primaryStaff.name}{o.brand ? ` · ${o.brand.name}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <span className={`badge ${ORDER_STATUS_STYLES[o.status as keyof typeof ORDER_STATUS_STYLES]}`}>{ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS]}</span>
                  {formatDate(o.currentDeadline)} ({daysRemaining(o.currentDeadline)}d)
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
