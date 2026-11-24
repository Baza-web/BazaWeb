import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { isCompanyWide, canManageOrdersScoped, canAccessOrders } from "@/lib/rbac";
import {
  getOrderPrioritySettings,
  computeAutoPriority,
  daysRemaining,
  daysOverdue,
  PRIORITY_STYLES,
  PRIORITY_LABELS,
} from "@/lib/orderPriority";
import { ORDER_STATUS_STYLES, ORDER_STATUS_LABELS, ORDER_STATUS_OPTIONS, DELAY_REASON_LABELS, DELAY_REASON_OPTIONS } from "../shared";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import {
  updateOrder,
  changeOrderStatus,
  updateProgress,
  changeDeadline,
  reportDelay,
  addOrderComment,
  submitForApproval,
  createLinkedTask,
  recordDispatch,
  recordDelivery,
} from "../actions";
import { WarningCircle, Trash, ChatText, ClipboardText } from "@/components/icons";

const RESTRICTED_STATUSES = ["APPROVED", "ON_HOLD", "CANCELLED"];

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  if (!canAccessOrders(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { id } = await params;

  const order = await db.order.findUnique({
    where: { id },
    include: {
      brand: true,
      customer: true,
      branch: true,
      primaryStaff: true,
      supportingStaff: true,
      createdBy: true,
      originalSalesperson: true,
      dispatchedBy: true,
      relatedSale: true,
      statusHistory: { include: { changedBy: true }, orderBy: { createdAt: "desc" } },
      deadlineHistory: { include: { changedBy: true }, orderBy: { createdAt: "desc" } },
      delays: { include: { reportedBy: true }, orderBy: { createdAt: "desc" } },
      approvals: { include: { requestedBy: true, reviewedBy: true }, orderBy: { createdAt: "desc" } },
      comments: { include: { staff: true }, orderBy: { createdAt: "desc" } },
      tasks: { include: { assignedTo: true } },
    },
  });
  if (!order) notFound();

  const isAssigned = order.primaryStaffId === session.staffId || order.supportingStaff.some((s) => s.id === session.staffId);
  const canManage = canManageOrdersScoped(session.role);
  if (!canManage && !isAssigned) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this order.</p>;
  }
  if (!isCompanyWide(session.role) && order.branchId && order.branchId !== session.branchId) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this order.</p>;
  }

  const settings = await getOrderPrioritySettings();
  const priority = computeAutoPriority(order.currentDeadline, order.status, settings);
  const remaining = daysRemaining(order.currentDeadline);
  const overdue = daysOverdue(order.currentDeadline);
  const pendingApproval = order.approvals.find((a) => !a.decision);

  const assignableStaff = isCompanyWide(session.role)
    ? await db.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } })
    : await db.staff.findMany({ where: { active: true, branchId: order.branchId ?? session.branchId ?? undefined }, orderBy: { name: "asc" } });

  const brands = isCompanyWide(session.role) || canManage ? await db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [];

  type TimelineEntry = { at: Date; node: React.ReactNode };
  const timeline: TimelineEntry[] = [
    ...order.statusHistory.map((h) => ({
      at: h.createdAt,
      node: (
        <>
          <span className="font-medium">{h.changedBy.name}</span> changed status
          {h.fromStatus ? ` from ${ORDER_STATUS_LABELS[h.fromStatus]}` : ""} to{" "}
          <span className="font-medium">{ORDER_STATUS_LABELS[h.toStatus]}</span>
          {h.reason ? ` — ${h.reason}` : ""}
        </>
      ),
    })),
    ...order.deadlineHistory.map((h) => ({
      at: h.createdAt,
      node: (
        <>
          <span className="font-medium">{h.changedBy.name}</span> moved the deadline from {formatDate(h.previousDeadline)} to{" "}
          {formatDate(h.newDeadline)} — {h.reason}
        </>
      ),
    })),
    ...order.delays.map((d) => ({
      at: d.createdAt,
      node: (
        <>
          <span className="font-medium">{d.reportedBy.name}</span> reported a delay ({DELAY_REASON_LABELS[d.reasonType]}): {d.explanation}
        </>
      ),
    })),
    ...order.approvals
      .filter((a) => a.decision)
      .map((a) => ({
        at: a.reviewedAt ?? a.createdAt,
        node: (
          <>
            <span className="font-medium">{a.reviewedBy?.name}</span> {a.decision === "APPROVED" ? "approved" : a.decision === "REVISION_REQUESTED" ? "requested a revision on" : "rejected"} the order
            {a.comments ? ` — ${a.comments}` : ""}
          </>
        ),
      })),
    ...order.comments.map((c) => ({
      at: c.createdAt,
      node: (
        <>
          <span className="font-medium">{c.staff.name}</span> commented: {c.body}
        </>
      ),
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders/all" className="text-sm font-medium text-brand-600 hover:underline">
          ← All Orders
        </Link>
        <h1 className="page-title mt-1 flex flex-wrap items-center gap-2">
          {order.productOrService}
          <span className={`badge ${ORDER_STATUS_STYLES[order.status]}`}>{ORDER_STATUS_LABELS[order.status]}</span>
          {priority && <span className={`badge ${PRIORITY_STYLES[priority]}`}>{PRIORITY_LABELS[priority]}</span>}
        </h1>
        <p className="text-sm text-stone-500">
          {order.orderNumber} · {order.orderType}
          {order.brand ? ` · ${order.brand.name}` : ""}
          {order.branch ? ` · ${order.branch.name}` : " · Company-wide"}
          {order.relatedSale && (
            <>
              {" · from "}
              <Link href={`/sales/${order.relatedSale.id}`} className="text-brand-600 hover:underline">
                {order.relatedSale.invoiceNumber}
              </Link>
            </>
          )}
        </p>
      </div>

      {pendingApproval && (
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>This order is awaiting approval. {canManage && <Link href="/orders/approvals" className="underline">Review it</Link>}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoTile label="Original deadline" value={order.deadlineNotSet ? "Not set" : formatDate(order.originalDeadline)} />
        <InfoTile label="Current deadline" value={order.deadlineNotSet ? "Not set" : formatDate(order.currentDeadline)} />
        <InfoTile
          label="Days remaining"
          value={order.deadlineNotSet ? "—" : remaining < 0 ? `${overdue}d overdue` : `${remaining}d`}
          tone={!order.deadlineNotSet && remaining < 0 ? "red" : undefined}
        />
        <InfoTile label="Progress" value={`${order.progressPercent}%`} />
      </div>

      {order.originalSalesperson && (
        <div className="card">
          <h2 className="section-title mb-2">Sales origin</h2>
          <p className="text-sm text-ink-900">
            <span className="font-medium">Original salesperson:</span> {order.originalSalesperson.name}
          </p>
          <p className="text-xs text-stone-500">
            Reassigning fulfilment below never changes who originally made this sale.
          </p>
        </div>
      )}

      <div className="card">
        <h2 className="section-title mb-3">Actions</h2>
        <div className="flex flex-wrap gap-4">
          <form action={changeOrderStatus.bind(null, order.id)} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label">Change status</label>
              <select className="input text-sm" name="status" defaultValue={order.status}>
                {ORDER_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} disabled={RESTRICTED_STATUSES.includes(s) && !canManage}>
                    {ORDER_STATUS_LABELS[s]}
                    {RESTRICTED_STATUSES.includes(s) && !canManage ? " (managers only)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Reason (optional)</label>
              <input className="input text-sm" name="reason" />
            </div>
            <button type="submit" className="btn-secondary text-sm">Update status</button>
          </form>

          <form action={updateProgress.bind(null, order.id)} className="flex items-end gap-2">
            <div>
              <label className="label">Progress %</label>
              <input className="input text-sm w-24" type="number" min="0" max="100" name="progressPercent" defaultValue={order.progressPercent} />
            </div>
            <button type="submit" className="btn-secondary text-sm">Save</button>
          </form>

          {!pendingApproval && order.status !== "COMPLETED" && order.status !== "CANCELLED" && (
            <form action={submitForApproval.bind(null, order.id)}>
              <button type="submit" className="btn-secondary text-sm">Submit for approval</button>
            </form>
          )}
        </div>
      </div>

      {canManage && (
        <div className="card">
          <h2 className="section-title mb-3">Change deadline</h2>
          <form action={changeDeadline.bind(null, order.id)} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label">New deadline</label>
              <input className="input text-sm" type="datetime-local" name="newDeadline" required />
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="label">Reason (required)</label>
              <input className="input text-sm" name="reason" required />
            </div>
            <button type="submit" className="btn-secondary text-sm">Change deadline</button>
          </form>
        </div>
      )}

      {(canManage || isAssigned) && order.status !== "DISPATCHED" && order.status !== "DELIVERED" && order.status !== "COMPLETED" && (
        <div className="card">
          <h2 className="section-title mb-3">Record dispatch</h2>
          <form action={recordDispatch.bind(null, order.id)} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input className="input text-sm" name="courierService" placeholder="Courier / transport service" />
            <input className="input text-sm" name="trackingNumber" placeholder="Tracking number" />
            <input className="input text-sm sm:col-span-2" name="dispatchNotes" placeholder="Dispatch notes" />
            <button type="submit" className="btn-secondary text-sm sm:col-span-4">Mark as dispatched</button>
          </form>
        </div>
      )}

      {(canManage || isAssigned) && order.status === "DISPATCHED" && (
        <div className="card">
          <h2 className="section-title mb-3">Record delivery</h2>
          <p className="mb-2 text-xs text-stone-500">
            Dispatched via {order.courierService ?? "—"} {order.trackingNumber ? `· tracking ${order.trackingNumber}` : ""}
            {order.actualDispatchDate ? ` on ${formatDate(order.actualDispatchDate)}` : ""}
          </p>
          <form action={recordDelivery.bind(null, order.id)} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label">Actual delivery date</label>
              <input className="input text-sm" type="datetime-local" name="actualDeliveryDate" />
            </div>
            <button type="submit" className="btn-secondary text-sm">Mark as delivered</button>
          </form>
        </div>
      )}

      {order.actualDeliveryDate && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          Delivered {formatDate(order.actualDeliveryDate)}.
        </div>
      )}

      <div className="card">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <WarningCircle size={18} className="text-amber-600" aria-hidden="true" />
          Report a delay
        </h2>
        <form action={reportDelay.bind(null, order.id)} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Reason</label>
            <select className="input text-sm" name="reasonType" defaultValue="OTHER">
              {DELAY_REASON_OPTIONS.map((r) => (
                <option key={r} value={r}>{DELAY_REASON_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="label">Explanation (required)</label>
            <input className="input text-sm" name="explanation" required />
          </div>
          <button type="submit" className="btn-secondary text-sm">Report delay</button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="section-title">Order details</h2>
          <DetailRow label="Customer" value={order.customer?.name ?? order.customerContact ?? "—"} />
          <DetailRow label="Department" value={order.department ?? "—"} />
          <DetailRow label="Quantity" value={String(order.quantity ?? 1)} />
          <DetailRow label="Order value" value={order.orderValue != null ? formatMoney(order.orderValue) : "—"} />
          <DetailRow label="Order date" value={formatDate(order.orderDate)} />
          <DetailRow label="Description" value={order.description ?? "—"} />
          <DetailRow label="Specifications" value={order.specifications ?? "—"} />
          <DetailRow label="Customization" value={order.customizationRequirements ?? "—"} />
          <DetailRow label="Customer instructions" value={order.customerInstructions ?? "—"} />
          {canManage && <DetailRow label="Internal instructions" value={order.internalInstructions ?? "—"} />}
          {order.relatedSale && (
            <DetailRow label="Related sale" value={<Link href={`/sales/${order.relatedSale.id}`} className="text-brand-600 hover:underline">{order.relatedSale.invoiceNumber}</Link>} />
          )}
        </div>

        <div className="card space-y-3">
          <h2 className="section-title">Assigned employees</h2>
          <p className="text-sm text-ink-900">
            <span className="font-medium">Primary:</span> {order.primaryStaff.name}
          </p>
          {order.supportingStaff.length > 0 && (
            <p className="text-sm text-ink-900">
              <span className="font-medium">Supporting:</span> {order.supportingStaff.map((s) => s.name).join(", ")}
            </p>
          )}
          <p className="text-xs text-stone-500">Created by {order.createdBy.name} on {formatDate(order.createdAt)}</p>

          {(order.referenceImages.length > 0 || order.supportingDocuments.length > 0) && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-900">Attachments</h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {order.referenceImages.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={img} href={img} target="_blank" rel="noreferrer">
                    <img src={img} alt="" className="h-20 w-full rounded-lg border border-stone-200 object-cover" />
                  </a>
                ))}
                {order.supportingDocuments.map((doc) => (
                  <a key={doc} href={doc} target="_blank" rel="noreferrer" className="flex h-20 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-500">
                    Document
                  </a>
                ))}
              </div>
            </div>
          )}

          {canManage && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-900">Create a linked staff task</h3>
              <form action={createLinkedTask.bind(null, order.id)} className="space-y-2">
                <input className="input text-sm" name="title" placeholder="Task title (e.g. Stone setting)" required />
                <div className="flex gap-2">
                  <select className="input text-sm" name="assignedToId" required defaultValue="">
                    <option value="" disabled>Assign to…</option>
                    {assignableStaff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <input className="input text-sm" type="date" name="dueDate" />
                  <button type="submit" className="btn-secondary text-sm whitespace-nowrap">Add task</button>
                </div>
              </form>
              {order.tasks.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {order.tasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between">
                      <span>{t.title} — {t.assignedTo.name}</span>
                      <span className="badge bg-stone-100 text-stone-600">{t.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <ChatText size={18} className="text-brand-500" aria-hidden="true" />
          Comments
        </h2>
        <form action={addOrderComment.bind(null, order.id)} className="mb-4 space-y-2" encType="multipart/form-data">
          <textarea className="input" name="body" rows={2} placeholder="Add an update, blocker, or question…" required />
          <div className="flex flex-wrap items-center gap-2">
            <input className="input text-sm" type="file" name="photos" accept="image/*" multiple />
            <input className="input text-sm" type="file" name="documents" accept="image/*,.pdf" multiple />
            <button type="submit" className="btn-secondary text-sm">Post</button>
          </div>
        </form>
        {order.comments.length === 0 ? (
          <p className="text-sm text-stone-400">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {order.comments.map((c) => (
              <li key={c.id} className="rounded-lg bg-stone-50 p-3 text-sm">
                <p className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-ink-900">{c.staff.name}</span>
                  <span className="text-xs text-stone-400">{formatDateTime(c.createdAt)}</span>
                </p>
                <p className="text-ink-800">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <ClipboardText size={18} className="text-brand-500" aria-hidden="true" />
          Activity timeline
        </h2>
        <ul className="space-y-2 text-sm">
          {timeline.map((entry, i) => (
            <li key={i} className="flex items-start gap-2 border-b border-stone-100 pb-2 last:border-0">
              <span className="w-32 shrink-0 text-xs text-stone-400">{formatDateTime(entry.at)}</span>
              <span className="text-ink-800">{entry.node}</span>
            </li>
          ))}
        </ul>
      </div>

      {canManage && (
        <details className="card">
          <summary className="section-title cursor-pointer">Edit order details</summary>
          <form action={updateOrder.bind(null, order.id)} className="mt-4 space-y-4" encType="multipart/form-data">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Brand</label>
                <select className="input" name="brandId" defaultValue={order.brandId ?? ""}>
                  <option value="">No specific brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Order type</label>
                <input className="input" name="orderType" required defaultValue={order.orderType} />
              </div>
            </div>
            <div>
              <label className="label">Product or service</label>
              <input className="input" name="productOrService" required defaultValue={order.productOrService} />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input" name="description" rows={2} defaultValue={order.description ?? ""} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Quantity</label>
                <input className="input" type="number" min="1" name="quantity" defaultValue={order.quantity ?? 1} />
              </div>
              <div>
                <label className="label">Order value</label>
                <input className="input" type="number" min="0" step="0.01" name="orderValue" defaultValue={order.orderValue ?? ""} />
              </div>
              <div>
                <label className="label">Department</label>
                <input className="input" name="department" defaultValue={order.department ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Primary responsible employee</label>
                <select className="input" name="primaryStaffId" required defaultValue={order.primaryStaffId}>
                  {assignableStaff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Customer contact</label>
                <input className="input" name="customerContact" defaultValue={order.customerContact ?? ""} />
              </div>
            </div>
            <div>
              <label className="label">Supporting employees</label>
              <div className="mt-1 grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-stone-200 p-2 sm:grid-cols-2">
                {assignableStaff.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-stone-50">
                    <input
                      type="checkbox"
                      name="supportingStaffIds"
                      value={s.id}
                      defaultChecked={order.supportingStaff.some((sup) => sup.id === s.id)}
                      className="h-4 w-4 rounded border-stone-300"
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
            <input type="hidden" name="promisedDeadline" value={order.originalDeadline.toISOString().slice(0, 16)} />
            <div>
              <label className="label">Add more reference images</label>
              <input className="input" type="file" name="referenceImages" accept="image/*" multiple />
            </div>
            <div>
              <label className="label">Add more supporting documents</label>
              <input className="input" type="file" name="supportingDocuments" accept="image/*,.pdf" multiple />
            </div>
            <button type="submit" className="btn-primary text-sm">Save changes</button>
          </form>
        </details>
      )}
    </div>
  );
}

function InfoTile({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div className="stat-tile">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === "red" ? "text-red-700" : "text-ink-900"}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="text-sm">
      <span className="font-medium text-ink-900">{label}:</span> <span className="text-stone-600">{value}</span>
    </p>
  );
}
