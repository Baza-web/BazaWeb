import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canReviewDeletions } from "@/lib/rbac";
import { formatDateTime } from "@/lib/utils";
import { decideEditRequest } from "./actions";

const TYPE_LABELS: Record<string, string> = {
  STAFF: "Staff account",
  INVENTORY: "Inventory item",
  CUSTOMER: "Customer",
  SALE: "Sale",
  BRAND: "Brand",
};

export default async function EditRequestsPage() {
  const session = await requireSessionOrRedirect();
  if (!canReviewDeletions(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const requests = await db.editRequest.findMany({
    include: { requestedBy: true, reviewedBy: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="page-title">Edit requests</h1>
      <p className="text-sm text-stone-500">
        When anyone other than the Owner edits a staff profile or an inventory item, the change shows up here
        for an Owner to approve or reject — nothing changes until you decide.
      </p>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-medium">Awaiting your review</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Type</th>
              <th>Record</th>
              <th>Change</th>
              <th>Requested by</th>
              <th>When</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.id}>
                <td>{TYPE_LABELS[r.entityType] ?? r.entityType}</td>
                <td className="font-medium">{r.entityLabel}</td>
                <td className="max-w-xs">{r.fieldSummary}</td>
                <td>{r.requestedBy.name}</td>
                <td>{formatDateTime(r.createdAt)}</td>
                <td>
                  <div className="flex gap-2">
                    <form action={decideEditRequest.bind(null, r.id)}>
                      <input type="hidden" name="decision" value="APPROVED" />
                      <button type="submit" className="btn-primary px-2 py-1 text-xs">
                        Approve
                      </button>
                    </form>
                    <form action={decideEditRequest.bind(null, r.id)}>
                      <input type="hidden" name="decision" value="REJECTED" />
                      <button type="submit" className="btn-secondary px-2 py-1 text-xs">
                        Reject
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-stone-400">
                  Nothing waiting on you right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {decided.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="mb-3 font-medium">Past decisions</h2>
          <table className="table-base">
            <thead>
              <tr>
                <th>Type</th>
                <th>Record</th>
                <th>Change</th>
                <th>Requested by</th>
                <th>Decision</th>
                <th>Reviewed by</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((r) => (
                <tr key={r.id}>
                  <td>{TYPE_LABELS[r.entityType] ?? r.entityType}</td>
                  <td className="font-medium">{r.entityLabel}</td>
                  <td className="max-w-xs">{r.fieldSummary}</td>
                  <td>{r.requestedBy.name}</td>
                  <td>
                    <span className={`badge ${r.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{r.reviewedBy?.name ?? "—"}</td>
                  <td>{r.reviewedAt ? formatDateTime(r.reviewedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
