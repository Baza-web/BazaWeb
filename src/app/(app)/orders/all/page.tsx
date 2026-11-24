import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { isCompanyWide, canManageOrdersScoped, canCreateOrders } from "@/lib/rbac";
import {
  getOrderPrioritySettings,
  computeAutoPriority,
  daysRemaining,
  overdueWhere,
  criticalWhere,
  highPriorityWhere,
  openOrderWhere,
  PRIORITY_STYLES,
  PRIORITY_LABELS,
  type AutoPriority,
} from "@/lib/orderPriority";
import { ORDER_STATUS_STYLES, ORDER_STATUS_LABELS, ORDER_STATUS_OPTIONS } from "../shared";
import { formatDate } from "@/lib/utils";
import { ClipboardText, Plus, Kanban, Table as TableIcon } from "@/components/icons";
import type { OrderStatus, Prisma } from "@prisma/client";

const PAGE_SIZE = 30;

export default async function AllOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    brand?: string;
    department?: string;
    employee?: string;
    status?: string;
    priority?: string;
    view?: string;
    page?: string;
  }>;
}) {
  const session = await requireSessionOrRedirect();
  const manageScoped = canManageOrdersScoped(session.role);
  const params = await searchParams;

  const scopeWhere: Prisma.OrderWhereInput = manageScoped
    ? isCompanyWide(session.role)
      ? {}
      : { branchId: session.branchId ?? undefined }
    : { OR: [{ primaryStaffId: session.staffId }, { supportingStaff: { some: { id: session.staffId } } }] };

  const filters: Prisma.OrderWhereInput[] = [scopeWhere];
  if (params.brand) filters.push({ brandId: params.brand });
  if (params.department) filters.push({ department: params.department });
  if (params.employee) filters.push({ OR: [{ primaryStaffId: params.employee }, { supportingStaff: { some: { id: params.employee } } }] });
  if (params.status && params.status !== "ALL") filters.push({ status: params.status as OrderStatus });
  else filters.push(openOrderWhere());
  if (params.q) {
    filters.push({
      OR: [
        { orderNumber: { contains: params.q, mode: "insensitive" } },
        { productOrService: { contains: params.q, mode: "insensitive" } },
        { description: { contains: params.q, mode: "insensitive" } },
        { customer: { name: { contains: params.q, mode: "insensitive" } } },
      ],
    });
  }

  const settings = await getOrderPrioritySettings();
  const now = new Date();
  if (params.priority === "OVERDUE") filters.push(overdueWhere(now));
  else if (params.priority === "CRITICAL") filters.push(criticalWhere(settings, now));
  else if (params.priority === "HIGH") filters.push(highPriorityWhere(settings, now));

  const where: Prisma.OrderWhereInput = { AND: filters };
  const view = params.view === "kanban" ? "kanban" : "table";
  const page = Math.max(1, Number(params.page) || 1);

  const [total, orders, brands, staffList, departmentRows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      include: { brand: true, customer: true, primaryStaff: true, supportingStaff: true, branch: true, delays: true, originalSalesperson: true },
      orderBy: { currentDeadline: "asc" },
      skip: view === "table" ? (page - 1) * PAGE_SIZE : 0,
      take: view === "table" ? PAGE_SIZE : 500,
    }),
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    isCompanyWide(session.role)
      ? db.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } })
      : db.staff.findMany({ where: { active: true, branchId: session.branchId ?? undefined }, orderBy: { name: "asc" } }),
    db.order.findMany({ where: { ...scopeWhere, department: { not: null } }, select: { department: true }, distinct: ["department"] }),
  ]);

  const departments = departmentRows.map((d) => d.department).filter(Boolean) as string[];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function qs(overrides: Record<string, string | undefined>) {
    const merged = { ...params, ...overrides };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `?${sp.toString()}`;
  }

  const kanbanColumns = ORDER_STATUS_OPTIONS.filter((s) => orders.some((o) => o.status === s));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardText size={26} className="text-brand-500" aria-hidden="true" />
            All Orders
          </h1>
          <p className="text-sm text-stone-500">{total} order{total === 1 ? "" : "s"} matching these filters.</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateOrders(session.role) && (
            <Link href="/orders/new" className="btn-primary text-sm">
              <Plus size={16} aria-hidden="true" /> Create New Order
            </Link>
          )}
          <Link href={qs({ view: "table" })} className={`btn-secondary text-sm ${view === "table" ? "bg-stone-200" : ""}`}>
            <TableIcon size={16} aria-hidden="true" /> Table
          </Link>
          <Link href={qs({ view: "kanban" })} className={`btn-secondary text-sm ${view === "kanban" ? "bg-stone-200" : ""}`}>
            <Kanban size={16} aria-hidden="true" /> Kanban
          </Link>
        </div>
      </div>

      <form className="card grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <input type="hidden" name="view" value={view} />
        <div className="col-span-2 sm:col-span-1">
          <label className="label">Search</label>
          <input className="input" name="q" defaultValue={params.q ?? ""} placeholder="Order #, item, customer…" />
        </div>
        <div>
          <label className="label">Brand</label>
          <select className="input" name="brand" defaultValue={params.brand ?? ""}>
            <option value="">All Brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Department</label>
          <select className="input" name="department" defaultValue={params.department ?? ""}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Employee</label>
          <select className="input" name="employee" defaultValue={params.employee ?? ""}>
            <option value="">All employees</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" name="status" defaultValue={params.status ?? "ALL"}>
            <option value="ALL">Open orders</option>
            {ORDER_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select className="input" name="priority" defaultValue={params.priority ?? ""}>
            <option value="">Any priority</option>
            <option value="OVERDUE">Overdue</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-3 lg:col-span-6">
          <button type="submit" className="btn-secondary text-sm">Apply filters</button>
          <Link href="/orders/all" className="ml-2 text-sm text-stone-500 hover:underline">Clear</Link>
        </div>
      </form>

      {view === "table" ? (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Order</th>
                <th>Brand</th>
                <th>Customer</th>
                <th>Salesperson</th>
                <th>Assigned</th>
                <th>Department</th>
                <th>Current Deadline</th>
                <th>Days Remaining</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <OrderRow key={o.id} o={o} settings={settings} />
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="py-8 text-center text-sm text-stone-400">No orders match these filters.</p>}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <Link href={qs({ page: String(Math.max(1, page - 1)) })} className={`btn-secondary ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}>
                Previous
              </Link>
              <span className="text-stone-500">Page {page} of {totalPages}</span>
              <Link href={qs({ page: String(Math.min(totalPages, page + 1)) })} className={`btn-secondary ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}>
                Next
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {kanbanColumns.length === 0 && <p className="text-sm text-stone-400">No orders match these filters.</p>}
          {kanbanColumns.map((status) => {
            const columnOrders = orders.filter((o) => o.status === status);
            return (
              <div key={status} className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-900">{ORDER_STATUS_LABELS[status]}</h3>
                  <span className="badge bg-stone-100 text-stone-600">{columnOrders.length}</span>
                </div>
                <div className="space-y-2">
                  {columnOrders.map((o) => {
                    const priority = computeAutoPriority(o.currentDeadline, o.status, settings, now);
                    return (
                      <Link key={o.id} href={`/orders/${o.id}`} className="card block p-3 hover:shadow-card-hover">
                        <p className="text-sm font-medium text-ink-900">{o.productOrService}</p>
                        <p className="text-xs text-stone-500">{o.orderNumber} · {o.primaryStaff.name}</p>
                        <div className="mt-2 flex items-center justify-between">
                          {priority && <span className={`badge text-[10px] ${PRIORITY_STYLES[priority]}`}>{PRIORITY_LABELS[priority]}</span>}
                          <span className="text-xs text-stone-400">{formatDate(o.currentDeadline)}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OrderRow({
  o,
  settings,
}: {
  o: Prisma.OrderGetPayload<{ include: { brand: true; customer: true; primaryStaff: true; supportingStaff: true; branch: true; delays: true; originalSalesperson: true } }>;
  settings: { criticalHours: number; highHours: number; mediumDays: number };
}) {
  const priority = computeAutoPriority(o.currentDeadline, o.status, settings);
  const remaining = daysRemaining(o.currentDeadline);
  const isDelayed = o.delays.length > 0 && !["COMPLETED", "CANCELLED"].includes(o.status);

  return (
    <tr>
      <td>
        <Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
          {o.orderNumber}
        </Link>
        <p className="text-xs text-stone-500">{o.productOrService}</p>
      </td>
      <td>{o.brand?.name ?? "—"}</td>
      <td>{o.customer?.name ?? o.customerContact ?? "—"}</td>
      <td>{o.originalSalesperson?.name ?? "—"}</td>
      <td>
        {o.primaryStaff.name}
        {o.supportingStaff.length > 0 && <span className="text-xs text-stone-400"> +{o.supportingStaff.length}</span>}
      </td>
      <td>{o.department ?? "—"}</td>
      <td>{formatDate(o.currentDeadline)}</td>
      <td className={remaining < 0 ? "text-red-600" : ""}>{remaining < 0 ? `${Math.abs(remaining)}d overdue` : `${remaining}d`}</td>
      <td>{priority && <span className={`badge ${PRIORITY_STYLES[priority as AutoPriority]}`}>{PRIORITY_LABELS[priority as AutoPriority]}</span>}</td>
      <td>
        <span className={`badge ${ORDER_STATUS_STYLES[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span>
        {isDelayed && <span className="ml-1 badge bg-red-50 text-red-600">Delayed</span>}
      </td>
      <td>
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${o.progressPercent}%` }} />
        </div>
      </td>
      <td className="text-xs text-stone-500">{formatDate(o.updatedAt)}</td>
    </tr>
  );
}
