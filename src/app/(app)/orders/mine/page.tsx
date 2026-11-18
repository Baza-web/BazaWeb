import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { getOrderPrioritySettings, computeAutoPriority, daysRemaining, daysOverdue, openOrderWhere, PRIORITY_STYLES, PRIORITY_LABELS } from "@/lib/orderPriority";
import { ORDER_STATUS_STYLES, ORDER_STATUS_LABELS } from "../shared";
import { formatDate } from "@/lib/utils";
import { IdentificationBadge } from "@/components/icons";

export default async function MyAssignedOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const { status } = await searchParams;

  const mineWhere = { OR: [{ primaryStaffId: session.staffId }, { supportingStaff: { some: { id: session.staffId } } }] };
  const where = status && status !== "ALL" ? { ...mineWhere, status: status as never } : { ...mineWhere, ...openOrderWhere() };

  const settings = await getOrderPrioritySettings();
  const orders = await db.order.findMany({
    where,
    include: { brand: true, customer: true, primaryStaff: true },
    orderBy: { currentDeadline: "asc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <IdentificationBadge size={26} className="text-brand-500" aria-hidden="true" />
          My Assigned Orders
        </h1>
        <p className="text-sm text-stone-500">Orders where you&apos;re the primary or a supporting employee.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {["ALL", "NEW_ORDER", "IN_PROGRESS", "REVISION_REQUIRED", "ON_HOLD"].map((s) => (
          <Link
            key={s}
            href={s === "ALL" ? "/orders/mine" : `/orders/mine?status=${s}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${(status ?? "ALL") === s ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
          >
            {s === "ALL" ? "Open" : ORDER_STATUS_LABELS[s as keyof typeof ORDER_STATUS_LABELS]}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-stone-400">No orders assigned to you right now.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => {
            const priority = computeAutoPriority(o.currentDeadline, o.status, settings);
            const remaining = daysRemaining(o.currentDeadline);
            const overdue = daysOverdue(o.currentDeadline);
            return (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:shadow-card-hover">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{o.productOrService}</p>
                    <p className="text-xs text-stone-500">
                      {o.orderNumber}
                      {o.brand ? ` · ${o.brand.name}` : ""}
                      {o.customer ? ` · ${o.customer.name}` : ""}
                      {o.primaryStaffId !== session.staffId ? " · Supporting" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${o.progressPercent}%` }} />
                    </div>
                    {priority && <span className={`badge ${PRIORITY_STYLES[priority]}`}>{PRIORITY_LABELS[priority]}</span>}
                    <span className={`badge ${ORDER_STATUS_STYLES[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span>
                    <span className="text-xs text-stone-400">{remaining < 0 ? `${overdue}d overdue` : `Due ${formatDate(o.currentDeadline)}`}</span>
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
