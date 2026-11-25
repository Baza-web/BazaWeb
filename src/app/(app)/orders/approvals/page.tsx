import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { isCompanyWide, canManageOrdersScoped } from "@/lib/rbac";
import { decideApproval } from "../actions";
import { formatDateTime } from "@/lib/utils";
import { ThumbsUp, ThumbsDown, CheckCircle } from "@/components/icons";

export default async function PendingApprovalsPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageOrdersScoped(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const scopeWhere = isCompanyWide(session.roles) ? {} : { order: { branchId: session.branchId ?? undefined } };

  const [pending, decided] = await Promise.all([
    db.orderApproval.findMany({
      where: { decision: null, ...scopeWhere },
      include: { order: { include: { brand: true, primaryStaff: true, customer: true } }, requestedBy: true },
      orderBy: { createdAt: "asc" },
    }),
    db.orderApproval.findMany({
      where: { NOT: { decision: null }, ...scopeWhere },
      include: { order: true, requestedBy: true, reviewedBy: true },
      orderBy: { reviewedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <CheckCircle size={26} className="text-brand-500" aria-hidden="true" />
          Pending Approvals
        </h1>
        <p className="text-sm text-stone-500">{pending.length} order{pending.length === 1 ? "" : "s"} awaiting a decision.</p>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-stone-400">Nothing waiting for approval.</p>
      ) : (
        <div className="space-y-3">
          {pending.map((a) => (
            <div key={a.id} className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link href={`/orders/${a.orderId}`} className="font-medium text-brand-700 hover:underline">
                    {a.order.orderNumber}
                  </Link>
                  <p className="text-sm text-stone-600">{a.order.productOrService}</p>
                  <p className="text-xs text-stone-500">
                    {a.order.primaryStaff.name}
                    {a.order.brand ? ` · ${a.order.brand.name}` : ""}
                    {a.order.customer ? ` · ${a.order.customer.name}` : ""}
                    {" · submitted by "}
                    {a.requestedBy.name}, {formatDateTime(a.createdAt)}
                  </p>
                </div>
              </div>
              <form action={decideApproval.bind(null, a.id)} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <label className="label">Comments (optional)</label>
                  <input className="input text-sm" name="comments" />
                </div>
                <button type="submit" name="decision" value="APPROVED" className="btn-primary text-sm">
                  <ThumbsUp size={16} aria-hidden="true" /> Approve
                </button>
                <button type="submit" name="decision" value="REVISION_REQUESTED" className="btn-secondary text-sm">
                  Request revision
                </button>
                <button type="submit" name="decision" value="REJECTED" className="btn-secondary text-sm text-red-600">
                  <ThumbsDown size={16} aria-hidden="true" /> Reject
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2 className="section-title mb-3">Recent decisions</h2>
        {decided.length === 0 ? (
          <p className="text-sm text-stone-400">No decisions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {decided.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <div>
                  <Link href={`/orders/${a.orderId}`} className="font-medium text-brand-700 hover:underline">{a.order.orderNumber}</Link>
                  <span className="ml-2 text-stone-500">{a.comments}</span>
                </div>
                <div className="text-xs text-stone-400">
                  {a.decision === "APPROVED" ? "Approved" : a.decision === "REVISION_REQUESTED" ? "Revision requested" : "Rejected"} by {a.reviewedBy?.name} · {a.reviewedAt && formatDateTime(a.reviewedAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
