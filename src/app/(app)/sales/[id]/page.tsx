import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canDeleteOrRequest } from "@/lib/rbac";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";
import { DeleteRecordButton } from "@/components/DeleteRecordButton";
import { CancelRequestButton } from "@/components/CancelRequestButton";
import { withdrawEditRequest } from "../../edit-requests/actions";
import { deleteSalePermanently, updateSale } from "../actions";

const PAYMENT_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER"] as const;

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  const sale = await db.sale.findFirst({
    where: { id, ...branchScope(session) },
    include: {
      customer: true,
      branch: true,
      staff: true,
      items: { include: { inventoryItem: true } },
    },
  });
  if (!sale) notFound();

  const [pendingEdit, customers, brands] = await Promise.all([
    db.editRequest.findFirst({ where: { entityType: "SALE", entityId: sale.id, status: "PENDING" } }),
    canDeleteOrRequest(session.roles)
      ? db.customer.findMany({ where: { branchId: sale.branchId }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    canDeleteOrRequest(session.roles) ? db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-2xl space-y-6 print:max-w-full">
      {pendingEdit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
          <p className="font-medium">An edit is awaiting Owner approval</p>
          <p className="mt-1 text-amber-700">
            {pendingEdit.fieldSummary} — requested {new Date(pendingEdit.createdAt).toLocaleDateString()}. No
            further edits can be made to this sale until that request is approved or rejected.
          </p>
          {pendingEdit.requestedById === session.staffId && (
            <CancelRequestButton onCancel={withdrawEditRequest.bind(null, pendingEdit.id)} />
          )}
        </div>
      )}

      <div className="card">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="page-title">{sale.branch.name}</h1>
            <p className="text-sm text-stone-500">Invoice {sale.invoiceNumber}</p>
          </div>
          <div className="text-right text-sm text-stone-500">
            <p>{formatDateTime(sale.createdAt)}</p>
            <p>Sold by {sale.staff.name}</p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs text-stone-500">Billed to</p>
          <p className="font-medium">{sale.customer?.name ?? "Walk-in customer"}</p>
          {sale.customer?.phone && <p className="text-sm text-stone-500">{sale.customer.phone}</p>}
        </div>

        <div className="mb-4 overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Line total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.inventoryItem.sku} — {item.inventoryItem.name}
                </td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.priceEach)}</td>
                <td>{formatMoney(item.priceEach * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatMoney(sale.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-{formatMoney(sale.discount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{formatMoney(sale.tax)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatMoney(sale.total)}</span>
          </div>
          <div className="flex justify-between text-stone-500">
            <span>Paid ({sale.paymentMethod.replace("_", " ")})</span>
            <span>{formatMoney(sale.amountPaid)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Balance</span>
            <span>{formatMoney(Math.max(sale.total - sale.amountPaid, 0))}</span>
          </div>
        </div>

        {sale.notes && (
          <p className="mt-4 border-t border-stone-100 pt-3 text-sm text-stone-500">{sale.notes}</p>
        )}
      </div>

      {canDeleteOrRequest(session.roles) && (
        <div className="card print:hidden">
          <h2 className="mb-3 font-medium">Edit sale</h2>
          <form action={updateSale.bind(null, sale.id)} className="space-y-3">
            <fieldset disabled={!!pendingEdit} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Customer</label>
                  <select className="input" name="customerId" defaultValue={sale.customerId ?? ""}>
                    <option value="">Walk-in customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Brand</label>
                  <select className="input" name="brandId" defaultValue={sale.brandId ?? ""}>
                    <option value="">No specific brand</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Discount</label>
                  <input className="input" type="number" step="0.01" min="0" name="discount" defaultValue={sale.discount} />
                </div>
                <div>
                  <label className="label">Amount paid</label>
                  <input className="input" type="number" step="0.01" min="0" name="amountPaid" defaultValue={sale.amountPaid} />
                </div>
                <div>
                  <label className="label">Payment method</label>
                  <select className="input" name="paymentMethod" defaultValue={sale.paymentMethod}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input" name="notes" defaultValue={sale.notes ?? ""} rows={2} />
              </div>
              <button type="submit" className="btn-primary">
                Save changes
              </button>
              {session.role !== "OWNER" && (
                <p className="text-xs text-stone-400">
                  Items and subtotal can&apos;t be edited here — saving will send this for an Owner to approve
                  before it takes effect.
                </p>
              )}
            </fieldset>
          </form>
        </div>
      )}

      <div className="flex items-center gap-4 print:hidden">
        <PrintButton label="Print invoice" />
        {canDeleteOrRequest(session.roles) && (
          <DeleteRecordButton
            action={deleteSalePermanently.bind(null, sale.id)}
            label="sale"
            isOwner={session.role === "OWNER"}
            redirectTo="/sales"
            confirmMessage={`Permanently delete invoice ${sale.invoiceNumber}? This restores the sold stock and removes its income entry — this can't be undone.`}
            requestMessage={`Request permanent deletion of invoice ${sale.invoiceNumber}? An Owner will need to approve it before anything happens.`}
          />
        )}
      </div>
    </div>
  );
}
