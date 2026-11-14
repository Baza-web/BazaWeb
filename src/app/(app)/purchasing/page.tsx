import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canManageAccounting, canManagePurchasing, isCompanyWide } from "@/lib/rbac";
import { formatDate, formatMoney } from "@/lib/utils";
import { PurchaseOrderForm } from "@/components/PurchaseOrderForm";
import { createSupplier, updatePurchaseOrderStatus, recordPurchaseOrderPayment } from "./actions";
import { Truck } from "@phosphor-icons/react/ssr";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-600",
  ORDERED: "bg-amber-100 text-amber-700",
  RECEIVED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function PurchasingPage() {
  const session = await requireSessionOrRedirect();
  const canManage = canManagePurchasing(session.role);
  const canPay = canManageAccounting(session.role);

  const scope = branchScope(session);

  const [orders, suppliers, branches] = await Promise.all([
    db.purchaseOrder.findMany({
      where: scope,
      include: { supplier: true, branch: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.supplier.findMany({ orderBy: { name: "asc" } }),
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Suppliers &amp; Purchase Orders</h1>

      {canManage && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card">
            <h2 className="section-title mb-3 flex items-center gap-2">
              <Truck size={18} className="text-brand-500" aria-hidden="true" />
              New purchase order
            </h2>
            {suppliers.length === 0 ? (
              <p className="text-sm text-stone-400">Add a supplier first, then create a purchase order.</p>
            ) : (
              <PurchaseOrderForm
                suppliers={suppliers}
                branches={branches}
                showBranchSelect={isCompanyWide(session.role)}
                defaultBranchId={session.branchId ?? branches[0]?.id ?? ""}
              />
            )}
          </div>

          <div className="card">
            <h2 className="section-title mb-3">Add supplier</h2>
            <form action={createSupplier} className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input className="input" name="name" required />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Contact person</label>
                  <input className="input" name="contactName" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" name="phone" />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" name="email" type="email" />
              </div>
              <div>
                <label className="label">Address</label>
                <input className="input" name="address" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input" name="notes" rows={2} />
              </div>
              <button type="submit" className="btn-secondary">
                Save supplier
              </button>
            </form>

            {suppliers.length > 0 && (
              <ul className="mt-4 divide-y divide-stone-100 text-sm">
                {suppliers.map((s) => (
                  <li key={s.id} className="py-2">
                    <p className="font-medium text-ink-900">{s.name}</p>
                    <p className="text-stone-500">
                      {[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="section-title mb-3">Purchase orders</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-stone-400">No purchase orders yet.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Supplier</th>
                <th>Items</th>
                <th>Expected</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Status</th>
                {(canManage || canPay) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const balance = order.totalAmount - order.amountPaid;
                return (
                  <tr key={order.id}>
                    <td className="font-medium text-ink-900">{order.orderNumber}</td>
                    <td>
                      {order.supplier.name}
                      {isCompanyWide(session.role) && (
                        <p className="text-xs text-stone-400">{order.branch.name}</p>
                      )}
                    </td>
                    <td>{order.items.length}</td>
                    <td>{order.expectedDate ? formatDate(order.expectedDate) : "—"}</td>
                    <td>{formatMoney(order.totalAmount)}</td>
                    <td>
                      {formatMoney(order.amountPaid)}
                      {balance > 0 && <span className="text-xs text-stone-400"> ({formatMoney(balance)} due)</span>}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_STYLES[order.status]}`}>{order.status}</span>
                    </td>
                    {(canManage || canPay) && (
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          {canManage && (
                            <form
                              action={updatePurchaseOrderStatus.bind(null, order.id)}
                              className="flex items-center gap-1"
                            >
                              <select className="input text-xs" name="status" defaultValue={order.status}>
                                <option value="DRAFT">Draft</option>
                                <option value="ORDERED">Ordered</option>
                                <option value="RECEIVED">Received</option>
                                <option value="CANCELLED">Cancelled</option>
                              </select>
                              <button type="submit" className="btn-secondary text-xs">
                                Save
                              </button>
                            </form>
                          )}
                          {canPay && balance > 0 && (
                            <form
                              action={recordPurchaseOrderPayment.bind(null, order.id)}
                              className="flex items-center gap-1"
                            >
                              <input
                                className="input w-20 text-xs"
                                name="amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={balance}
                                placeholder="Amount"
                                required
                              />
                              <button type="submit" className="btn-secondary text-xs">
                                Pay
                              </button>
                            </form>
                          )}
                        </div>
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
