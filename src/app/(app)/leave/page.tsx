import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canReviewLeave, isCompanyWide } from "@/lib/rbac";
import { formatDate, formatDateTime } from "@/lib/utils";
import { createLeaveRequest, reviewLeaveRequest } from "./actions";
import { CalendarCheck } from "@phosphor-icons/react/ssr";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default async function LeavePage() {
  const session = await requireSessionOrRedirect();
  const reviewer = canReviewLeave(session.role);

  const [myRequests, pendingRequests] = await Promise.all([
    db.leaveRequest.findMany({
      where: { staffId: session.staffId },
      orderBy: { createdAt: "desc" },
    }),
    reviewer
      ? db.leaveRequest.findMany({
          where: {
            status: "PENDING",
            staff: isCompanyWide(session.role) ? {} : { branchId: session.branchId },
          },
          include: { staff: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="page-title">Leave</h1>

      {reviewer && (
        <div className="card">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <CalendarCheck size={18} className="text-brand-500" aria-hidden="true" />
            Pending approvals
          </h2>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-stone-400">Nothing waiting on you right now.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {pendingRequests.map((req) => (
                <li key={req.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-ink-900">
                      {req.staff.name} · {req.type.replace("_", " ")}
                    </p>
                    <p className="text-sm text-stone-500">
                      {formatDate(req.startDate)} – {formatDate(req.endDate)}
                      {req.reason ? ` · ${req.reason}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={reviewLeaveRequest.bind(null, req.id)}>
                      <input type="hidden" name="decision" value="APPROVED" />
                      <button type="submit" className="btn-secondary text-xs">
                        Approve
                      </button>
                    </form>
                    <form action={reviewLeaveRequest.bind(null, req.id)}>
                      <input type="hidden" name="decision" value="REJECTED" />
                      <button type="submit" className="btn-danger text-xs">
                        Reject
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card max-w-lg">
        <h2 className="section-title mb-3">Request leave</h2>
        <form action={createLeaveRequest} className="space-y-4">
          <div>
            <label className="label">Type</label>
            <select className="input" name="type" defaultValue="VACATION">
              <option value="SICK">Sick</option>
              <option value="VACATION">Vacation</option>
              <option value="PERSONAL">Personal</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Start date</label>
              <input className="input" name="startDate" type="date" required />
            </div>
            <div>
              <label className="label">End date</label>
              <input className="input" name="endDate" type="date" required />
            </div>
          </div>
          <div>
            <label className="label">Reason (optional)</label>
            <textarea className="input" name="reason" rows={2} />
          </div>
          <button type="submit" className="btn-primary">
            Submit request
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="section-title mb-3">Your requests</h2>
        {myRequests.length === 0 ? (
          <p className="text-sm text-stone-400">No leave requests yet.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Type</th>
                <th>Dates</th>
                <th>Submitted</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((req) => (
                <tr key={req.id}>
                  <td>{req.type.replace("_", " ")}</td>
                  <td>
                    {formatDate(req.startDate)} – {formatDate(req.endDate)}
                  </td>
                  <td>{formatDateTime(req.createdAt)}</td>
                  <td>
                    <span className={`badge ${STATUS_STYLES[req.status]}`}>{req.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
