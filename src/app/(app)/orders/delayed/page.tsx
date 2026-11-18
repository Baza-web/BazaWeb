import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { isCompanyWide, canManageOrdersScoped } from "@/lib/rbac";
import { overdueWhere, daysOverdue } from "@/lib/orderPriority";
import { ORDER_STATUS_STYLES, ORDER_STATUS_LABELS, DELAY_REASON_LABELS } from "../shared";
import { formatDate, formatDateTime } from "@/lib/utils";
import { WarningCircle } from "@/components/icons";

export default async function DelayedOrdersPage() {
  const session = await requireSessionOrRedirect();
  const manageScoped = canManageOrdersScoped(session.role);

  const scopeWhere = manageScoped
    ? isCompanyWide(session.role)
      ? {}
      : { branchId: session.branchId ?? undefined }
    : { OR: [{ primaryStaffId: session.staffId }, { supportingStaff: { some: { id: session.staffId } } }] };

  const orders = await db.order.findMany({
    where: { ...scopeWhere, ...overdueWhere() },
    include: { brand: true, customer: true, primaryStaff: true, delays: { include: { reportedBy: true }, orderBy: { createdAt: "desc" } } },
    orderBy: { currentDeadline: "asc" },
    take: 300,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <WarningCircle size={26} className="text-red-600" aria-hidden="true" />
          Delayed Orders
        </h1>
        <p className="text-sm text-stone-500">Orders that have passed their current deadline and are still incomplete.</p>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-stone-400">Nothing delayed right now.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Order</th>
                <th>Brand</th>
                <th>Customer</th>
                <th>Assigned</th>
                <th>Department</th>
                <th>Original Deadline</th>
                <th>Current Deadline</th>
                <th>Days Delayed</th>
                <th>Status</th>
                <th>Delay Reason</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const latestDelay = o.delays[0];
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.orderNumber}</Link>
                      <p className="text-xs text-stone-500">{o.productOrService}</p>
                    </td>
                    <td>{o.brand?.name ?? "—"}</td>
                    <td>{o.customer?.name ?? o.customerContact ?? "—"}</td>
                    <td>{o.primaryStaff.name}</td>
                    <td>{o.department ?? "—"}</td>
                    <td>{formatDate(o.originalDeadline)}</td>
                    <td>{formatDate(o.currentDeadline)}</td>
                    <td className="font-medium text-red-600">{daysOverdue(o.currentDeadline)}d</td>
                    <td><span className={`badge ${ORDER_STATUS_STYLES[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span></td>
                    <td className="max-w-[200px]">
                      {latestDelay ? (
                        <>
                          <span className="badge bg-amber-100 text-amber-700">{DELAY_REASON_LABELS[latestDelay.reasonType]}</span>
                          <p className="mt-1 text-xs text-stone-500">{latestDelay.explanation}</p>
                        </>
                      ) : (
                        <span className="text-xs text-stone-400">Not yet reported</span>
                      )}
                    </td>
                    <td className="text-xs text-stone-500">{formatDateTime(o.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
