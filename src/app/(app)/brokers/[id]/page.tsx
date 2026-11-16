import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canManageBrokers } from "@/lib/rbac";
import { formatMoney, formatDate, formatDateTime, initials } from "@/lib/utils";
import { RecordReturnForm } from "@/components/RecordReturnForm";
import { reviewMemoEditRequest, resendBrokerStatement, updateBroker, deleteBrokerPermanently } from "../actions";
import { Handshake, ArrowCounterClockwise, CheckCircle, X } from "@/components/icons";
import { DeleteRecordButton } from "@/components/DeleteRecordButton";
import { CancelRequestButton } from "@/components/CancelRequestButton";
import { withdrawEditRequest } from "../../edit-requests/actions";

const MEMO_STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-700",
  PARTIALLY_RETURNED: "bg-blue-100 text-blue-700",
  RETURNED: "bg-green-100 text-green-700",
};

export default async function BrokerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrokers(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }
  const { id } = await params;

  const broker = await db.broker.findFirst({
    where: { id, ...branchScope(session) },
    include: {
      memos: {
        include: {
          items: { include: { inventoryItem: true } },
          editRequests: {
            where: { status: "PENDING" },
            include: { requestedBy: true },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { issuedAt: "desc" },
      },
    },
  });
  if (!broker) notFound();

  const pendingBrokerEdit = await db.editRequest.findFirst({
    where: { entityType: "BROKER", entityId: broker.id, status: "PENDING" },
  });

  let outstandingCount = 0;
  let outstandingValue = 0;
  for (const memo of broker.memos) {
    for (const item of memo.items) {
      const out = item.quantity - item.returnedQuantity;
      outstandingCount += out;
      outstandingValue += out * item.valueEach;
    }
  }

  const pendingRequests = broker.memos.flatMap((memo) =>
    memo.editRequests.map((req) => ({ memo, req })),
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="avatar h-12 w-12">{initials(broker.name)}</span>
          <div>
            <h1 className="page-title">{broker.name}</h1>
            <p className="text-sm text-stone-500">
              {[broker.company, broker.phone, broker.email].filter(Boolean).join(" · ") || "No contact info"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {broker.email && (
            <form action={resendBrokerStatement.bind(null, broker.id)}>
              <button type="submit" className="btn-secondary text-sm">
                Email statement now
              </button>
            </form>
          )}
          <DeleteRecordButton
            action={deleteBrokerPermanently.bind(null, broker.id)}
            label="broker"
            isOwner={session.role === "OWNER"}
            confirmMessage={`Permanently delete ${broker.name}? This can't be undone.`}
            requestMessage={`Request permanent deletion of ${broker.name}? An Owner will need to approve it before anything happens.`}
            redirectTo="/brokers"
          />
        </div>
      </div>

      {pendingBrokerEdit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">A contact-detail edit is awaiting Owner approval</p>
          <p className="mt-1 text-amber-700">
            {pendingBrokerEdit.fieldSummary} — requested {new Date(pendingBrokerEdit.createdAt).toLocaleDateString()}.
          </p>
          {pendingBrokerEdit.requestedById === session.staffId && (
            <CancelRequestButton onCancel={withdrawEditRequest.bind(null, pendingBrokerEdit.id)} />
          )}
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-medium">Edit contact details</h2>
        <form action={updateBroker.bind(null, broker.id)} className="space-y-3">
          <fieldset disabled={!!pendingBrokerEdit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Name</label>
                <input className="input" name="name" defaultValue={broker.name} required />
              </div>
              <div>
                <label className="label">Company</label>
                <input className="input" name="company" defaultValue={broker.company ?? ""} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" name="phone" defaultValue={broker.phone ?? ""} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" name="email" defaultValue={broker.email ?? ""} />
              </div>
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" name="address" defaultValue={broker.address ?? ""} />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input" name="notes" rows={2} defaultValue={broker.notes ?? ""} />
            </div>
            <button type="submit" className="btn-primary">
              Save changes
            </button>
            {session.role !== "OWNER" && (
              <p className="text-xs text-stone-400">Saving will send this for an Owner to approve — nothing changes until then.</p>
            )}
          </fieldset>
        </form>
      </div>

      <div className="card grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-stone-500">Stones outstanding</p>
          <p className="text-xl font-semibold text-ink-900">{outstandingCount}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Outstanding value</p>
          <p className="text-xl font-semibold text-ink-900">{formatMoney(outstandingValue)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Total memos</p>
          <p className="text-xl font-semibold text-ink-900">{broker.memos.length}</p>
        </div>
      </div>

      {pendingRequests.length > 0 && (
        <div className="card border-2 border-amber-200">
          <h2 className="section-title mb-3 flex items-center gap-2 text-amber-800">
            <ArrowCounterClockwise size={18} aria-hidden="true" />
            Pending approval
          </h2>
          <ul className="space-y-3">
            {pendingRequests.map(({ memo, req }) => {
              const isOwnRequest = req.requestedById === session.staffId;
              const itemReturns = req.itemReturns as { memoItemId: string; returnQuantity: number }[];
              return (
                <li key={req.id} className="rounded-lg bg-amber-50 p-3">
                  <p className="text-sm">
                    <span className="font-medium">{req.requestedBy.name}</span> proposed returning{" "}
                    {itemReturns.reduce((s, r) => s + r.returnQuantity, 0)} stone(s) on{" "}
                    <span className="font-medium">{memo.memoNumber}</span>
                    {req.reason ? ` — "${req.reason}"` : ""}
                  </p>
                  <p className="text-xs text-stone-500">Requested {formatDateTime(req.createdAt)}</p>
                  {isOwnRequest ? (
                    <p className="mt-2 text-xs italic text-stone-500">
                      Waiting for another Owner/Admin to review — you can&apos;t approve your own request.
                    </p>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <form action={reviewMemoEditRequest.bind(null, req.id)}>
                        <input type="hidden" name="decision" value="APPROVED" />
                        <button type="submit" className="btn-secondary text-xs">
                          <CheckCircle size={14} aria-hidden="true" />
                          Approve
                        </button>
                      </form>
                      <form action={reviewMemoEditRequest.bind(null, req.id)}>
                        <input type="hidden" name="decision" value="REJECTED" />
                        <button type="submit" className="btn-danger text-xs">
                          <X size={14} aria-hidden="true" />
                          Reject
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="section-title flex items-center gap-2">
          <Handshake size={18} className="text-brand-500" aria-hidden="true" />
          Memo history
        </h2>
        {broker.memos.length === 0 && <p className="card text-sm text-stone-400">No memos issued yet.</p>}
        {broker.memos.map((memo) => {
          const hasOutstanding = memo.items.some((i) => i.quantity > i.returnedQuantity);
          const hasPending = memo.editRequests.length > 0;
          return (
            <div key={memo.id} className="card overflow-x-auto">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-900">{memo.memoNumber}</p>
                  <p className="text-xs text-stone-500">
                    Issued {formatDate(memo.issuedAt)}
                    {memo.expectedReturnAt ? ` · Expected back ${formatDate(memo.expectedReturnAt)}` : ""}
                  </p>
                </div>
                <span className={`badge ${MEMO_STATUS_STYLES[memo.status]}`}>{memo.status.replace("_", " ")}</span>
              </div>

              <table className="table-base">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Item</th>
                    <th>Taken</th>
                    <th>Returned</th>
                    <th>Outstanding</th>
                    <th>Value each</th>
                  </tr>
                </thead>
                <tbody>
                  {memo.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.inventoryItem.sku}</td>
                      <td>{item.inventoryItem.name}</td>
                      <td>{item.quantity}</td>
                      <td>{item.returnedQuantity}</td>
                      <td>{item.quantity - item.returnedQuantity}</td>
                      <td>{formatMoney(item.valueEach)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {memo.notes && <p className="mt-2 text-sm text-stone-500">{memo.notes}</p>}

              {hasOutstanding && !hasPending && (
                <div className="mt-3">
                  <RecordReturnForm
                    memoId={memo.id}
                    items={memo.items
                      .filter((i) => i.quantity > i.returnedQuantity)
                      .map((i) => ({
                        id: i.id,
                        name: i.inventoryItem.name,
                        sku: i.inventoryItem.sku,
                        outstanding: i.quantity - i.returnedQuantity,
                      }))}
                  />
                </div>
              )}
              {hasPending && (
                <p className="mt-3 text-xs text-amber-700">
                  A return is already pending approval for this memo — see above.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
