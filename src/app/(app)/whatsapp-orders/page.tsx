import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canRecordSale, canCreateOrders } from "@/lib/rbac";
import { db } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { WhatsappLogo } from "@/components/icons";
import { dismissWhatsAppOrder } from "../sales/actions";
import type { ExtractedOrder } from "@/lib/ai";

export default async function WhatsAppOrdersPage() {
  const session = await requireSessionOrRedirect();
  if (!canRecordSale(session.roles) && !canCreateOrders(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }
  const showRecordSale = canRecordSale(session.roles);
  const showCreateOrder = canCreateOrders(session.roles);

  const orders = await db.whatsAppInboundOrder.findMany({
    where: { status: "PENDING" },
    orderBy: { receivedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="page-title flex items-center gap-2">
        <WhatsappLogo size={26} className="text-brand-500" aria-hidden="true" />
        WhatsApp Orders
      </h1>
      <p className="text-sm text-stone-500">
        Orders sent to the business WhatsApp number, read by AI and waiting for a staff member to review. Nothing
        here is ever saved automatically — pick one, check the details against the original message, choose a
        branch, and either record it as a sale (an existing stock item) or create a custom order (a bespoke piece
        to be made) yourself.
      </p>

      <div className="card">
        {orders.length === 0 ? (
          <p className="text-sm text-stone-400">No pending WhatsApp orders right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>From</th>
                  <th>Customer guess</th>
                  <th>Order ref</th>
                  <th>Summary</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const extracted = order.extractedJson as unknown as ExtractedOrder;
                  const itemCount = extracted.items?.length ?? 0;
                  return (
                    <tr key={order.id}>
                      <td className="text-xs text-stone-500 whitespace-nowrap">{formatDateTime(order.receivedAt)}</td>
                      <td className="whitespace-nowrap">{order.fromPhone}</td>
                      <td>{order.customerNameGuess ?? <span className="text-stone-400">Unknown</span>}</td>
                      <td>{order.externalOrderNumber ?? <span className="text-stone-400">—</span>}</td>
                      <td className="max-w-xs">
                        <p className="text-sm">
                          {itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "No items detected"}
                          {extracted.amountPaid ? ` · Paid ${formatMoney(extracted.amountPaid)}` : ""}
                        </p>
                        {order.rawText && <p className="text-xs text-stone-400 truncate">{order.rawText}</p>}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex flex-wrap gap-2">
                          {showRecordSale && (
                            <Link href={`/sales/new?whatsappOrderId=${order.id}`} className="btn-primary text-xs">
                              Record sale
                            </Link>
                          )}
                          {showCreateOrder && (
                            <Link href={`/orders/new?whatsappOrderId=${order.id}`} className="btn-secondary text-xs">
                              Custom order
                            </Link>
                          )}
                          <form action={dismissWhatsAppOrder.bind(null, order.id)}>
                            <button type="submit" className="btn-secondary text-xs">Dismiss</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
