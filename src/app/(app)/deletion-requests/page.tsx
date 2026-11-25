import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canReviewCustomerRequests } from "@/lib/rbac";
import { formatDateTime, formatDate } from "@/lib/utils";
import { decideDeletionRequest } from "./actions";
import { PrintButton } from "@/components/PrintButton";

const TYPE_LABELS: Record<string, string> = {
  STAFF: "Staff account",
  INVENTORY: "Inventory item",
  SALE: "Sale",
  CUSTOMER: "Customer",
  EXPENSE: "Expense",
  BROKER: "Broker",
  BRAND: "Brand",
};

export default async function DeletionRequestsPage() {
  const session = await requireSessionOrRedirect();
  if (!canReviewCustomerRequests(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }
  // Admin reviews Customer and Brand requests only — every other entity type stays Owner-only.
  const adminFilteredTypes = !session.roles.includes("OWNER");

  const requests = await db.deletionRequest.findMany({
    where: adminFilteredTypes ? { entityType: { in: ["CUSTOMER", "BRAND"] } } : undefined,
    include: { requestedBy: true, reviewedBy: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">Deletion requests</h1>
          <p className="text-sm text-stone-500">
            When an Admin asks to delete a staff account, inventory item, or sale, it shows up here for an Owner
            to approve or reject — nothing is deleted until you decide. A customer deletion requested by Sales
            staff can also be approved or rejected by an Admin.
          </p>
        </div>
        <PrintButton selector="#pending-deletion-requests" label="Print" />
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Deletion requests</h2>
        <p className="text-sm text-stone-500">Printed {formatDate(new Date())}</p>
      </div>

      <div id="pending-deletion-requests" className="card overflow-x-auto">
        <h2 className="mb-3 font-medium">Awaiting your review</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Type</th>
              <th>Record</th>
              <th>Reason</th>
              <th>Requested by</th>
              <th>When</th>
              <th className="print:hidden">Decision</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.id}>
                <td>{TYPE_LABELS[r.entityType] ?? r.entityType}</td>
                <td className="font-medium">{r.entityLabel}</td>
                <td>{r.reason ?? "—"}</td>
                <td>{r.requestedBy.name}</td>
                <td>{formatDateTime(r.createdAt)}</td>
                <td className="print:hidden">
                  <div className="flex gap-2">
                    <form action={decideDeletionRequest.bind(null, r.id)}>
                      <input type="hidden" name="decision" value="APPROVED" />
                      <button type="submit" className="btn-primary px-2 py-1 text-xs">
                        Approve
                      </button>
                    </form>
                    <form action={decideDeletionRequest.bind(null, r.id)}>
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
