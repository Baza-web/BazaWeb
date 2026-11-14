import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope } from "@/lib/rbac";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";

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

  return (
    <div className="max-w-2xl space-y-6 print:max-w-full">
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

      <PrintButton />
    </div>
  );
}
