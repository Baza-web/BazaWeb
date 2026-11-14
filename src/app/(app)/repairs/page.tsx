import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canManageRepairs, isCompanyWide } from "@/lib/rbac";
import { formatDate, formatMoney } from "@/lib/utils";
import { createRepairOrder, updateRepairStatus, assignRepairOrder } from "./actions";
import { Wrench } from "@phosphor-icons/react/ssr";

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: "bg-stone-100 text-stone-600",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  READY: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function RepairsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const canManage = canManageRepairs(session.role);
  const canUpdateStatus = canManage || session.role === "CRAFTSMAN";
  const { status } = await searchParams;

  const scope = branchScope(session);

  const [orders, customers, branches, craftsmen] = await Promise.all([
    db.repairOrder.findMany({
      where: {
        ...(session.role === "CRAFTSMAN" ? { assignedToId: session.staffId } : scope),
        ...(status ? { status: status as never } : {}),
      },
      include: { customer: true, assignedTo: true, branch: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    canManage
      ? db.customer.findMany({ where: scope, orderBy: { name: "asc" }, take: 500 })
      : Promise.resolve([]),
    canManage && isCompanyWide(session.role)
      ? db.branch.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    canManage
      ? db.staff.findMany({
          where: { role: "CRAFTSMAN", active: true, ...(isCompanyWide(session.role) ? {} : { branchId: session.branchId }) },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Repairs &amp; Custom Orders</h1>

      {canManage && (
        <div className="card max-w-2xl">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Wrench size={18} className="text-brand-500" aria-hidden="true" />
            Intake new order
          </h2>
          <form action={createRepairOrder} className="space-y-4" encType="multipart/form-data">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Customer</label>
                <select className="input" name="customerId" required defaultValue="">
                  <option value="" disabled>
                    Select customer…
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" name="type" defaultValue="REPAIR">
                  <option value="REPAIR">Repair</option>
                  <option value="CUSTOM">Custom order</option>
                </select>
              </div>
            </div>

            {isCompanyWide(session.role) && (
              <div>
                <label className="label">Branch</label>
                <select className="input" name="branchId" required defaultValue={session.branchId ?? ""}>
                  <option value="" disabled>
                    Select branch…
                  </option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label">Description</label>
              <textarea className="input" name="description" rows={2} required />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Promised date</label>
                <input className="input" name="promisedDate" type="date" />
              </div>
              <div>
                <label className="label">Estimated cost</label>
                <input className="input" name="estimatedCost" type="number" step="0.01" min="0" />
              </div>
              <div>
                <label className="label">Assign to</label>
                <select className="input" name="assignedToId" defaultValue="">
                  <option value="">Unassigned</option>
                  {craftsmen.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Photos (optional)</label>
              <input className="input" name="photos" type="file" accept="image/*" multiple />
            </div>

            <div>
              <label className="label">Notes (optional)</label>
              <textarea className="input" name="notes" rows={2} />
            </div>

            <button type="submit" className="btn-primary">
              Create order
            </button>
          </form>
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">
            {session.role === "CRAFTSMAN" ? "Assigned to me" : "All orders"}
          </h2>
          <form action="/repairs" className="flex gap-2">
            <select className="input text-sm" name="status" defaultValue={status ?? ""}>
              <option value="">All statuses</option>
              <option value="RECEIVED">Received</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="READY">Ready</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <button type="submit" className="btn-secondary text-sm">
              Filter
            </button>
          </form>
        </div>

        {orders.length === 0 ? (
          <p className="text-sm text-stone-400">No orders yet.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>Description</th>
                <th>Promised</th>
                <th>Cost</th>
                <th>Assigned to</th>
                <th>Status</th>
                {canUpdateStatus && <th>Update</th>}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const canUpdateThis =
                  canManage || (session.role === "CRAFTSMAN" && order.assignedToId === session.staffId);
                return (
                  <tr key={order.id}>
                    <td>
                      <p className="font-medium text-ink-900">{order.customer.name}</p>
                      {isCompanyWide(session.role) && (
                        <p className="text-xs text-stone-400">{order.branch.name}</p>
                      )}
                    </td>
                    <td>{order.type === "CUSTOM" ? "Custom" : "Repair"}</td>
                    <td className="max-w-xs truncate">{order.description}</td>
                    <td>{order.promisedDate ? formatDate(order.promisedDate) : "—"}</td>
                    <td>
                      {order.finalCost
                        ? formatMoney(order.finalCost)
                        : order.estimatedCost
                          ? `~${formatMoney(order.estimatedCost)}`
                          : "—"}
                    </td>
                    <td>
                      {canManage ? (
                        <form
                          action={assignRepairOrder.bind(null, order.id)}
                          className="flex items-center gap-1"
                        >
                          <select
                            className="input text-xs"
                            name="assignedToId"
                            defaultValue={order.assignedToId ?? ""}
                          >
                            <option value="">Unassigned</option>
                            {craftsmen.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="btn-secondary text-xs">
                            Set
                          </button>
                        </form>
                      ) : (
                        order.assignedTo?.name ?? "—"
                      )}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_STYLES[order.status]}`}>
                        {order.status.replace("_", " ")}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        {canUpdateThis && (
                          <form
                            action={updateRepairStatus.bind(null, order.id)}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <select className="input text-xs" name="status" defaultValue={order.status}>
                              <option value="RECEIVED">Received</option>
                              <option value="IN_PROGRESS">In progress</option>
                              <option value="READY">Ready</option>
                              <option value="COMPLETED">Completed</option>
                              <option value="CANCELLED">Cancelled</option>
                            </select>
                            <input
                              className="input text-xs w-24"
                              name="finalCost"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Final cost"
                              defaultValue={order.finalCost ?? ""}
                            />
                            <button type="submit" className="btn-secondary text-xs">
                              Save
                            </button>
                          </form>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
