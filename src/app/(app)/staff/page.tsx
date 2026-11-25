import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageStaffScoped, canManageStaff, branchScope, ROLE_LABELS } from "@/lib/rbac";
import { toggleStaffActive, deleteStaffPermanently } from "./actions";
import { DeleteRecordButton } from "@/components/DeleteRecordButton";
import { Plus } from "@phosphor-icons/react/ssr";
import { PrintButton } from "@/components/PrintButton";
import { ExportButton } from "@/components/ExportButton";
import { formatDate } from "@/lib/utils";

export default async function StaffPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }
  const canDelete = canManageStaff(session.roles);

  const staff = await db.staff.findMany({
    where: { ...branchScope(session), deletedAt: null },
    include: { branch: true, brands: true },
    // Active staff first, then by name, so a growing roster of leavers never buries who's actually working today.
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Staff accounts</h1>
        <div className="flex items-center gap-2">
          <ExportButton href="/api/export/staff" />
          <PrintButton selector="#staff-table" />
          <Link href="/staff/new" className="btn-primary print:hidden">
            <Plus size={16} aria-hidden="true" />
            Add staff
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Staff directory</h2>
        <p className="text-sm text-stone-500">Printed {formatDate(new Date())} — {staff.length} staff member(s)</p>
      </div>

      <div id="staff-table" className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Branch</th>
              <th>Brands</th>
              <th>Status</th>
              <th className="print:hidden">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} data-print-row className={s.active ? undefined : "opacity-60"}>
                <td className="print:hidden">
                  <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include ${s.name} in print`} />
                </td>
                <td className="font-medium">
                  <Link href={`/staff/${s.id}`} className="text-brand-700 hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td>{s.email}</td>
                <td>
                  {ROLE_LABELS[s.role]}
                  {s.additionalRoles.length > 0 && (
                    <span className="text-xs text-stone-400"> + {s.additionalRoles.map((r) => ROLE_LABELS[r]).join(", ")}</span>
                  )}
                </td>
                <td>{s.branch?.name ?? "—"}</td>
                <td className="text-xs text-stone-500">
                  {s.brands.length > 0 ? s.brands.map((b) => b.name).join(", ") : "—"}
                </td>
                <td>
                  <span
                    className={`badge ${
                      s.active ? "bg-green-100 text-green-700" : "bg-stone-200 text-stone-600"
                    }`}
                  >
                    {s.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="print:hidden">
                  {s.id !== session.staffId && (
                    <div className="flex items-center gap-3">
                      {canDelete && (
                        <Link href={`/staff/${s.id}`} className="text-xs text-brand-600 hover:underline">
                          Edit
                        </Link>
                      )}
                      <form action={toggleStaffActive.bind(null, s.id)}>
                        <button type="submit" className="btn-secondary text-xs">
                          {s.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                      {canDelete && (
                        <DeleteRecordButton
                          action={deleteStaffPermanently.bind(null, s.id)}
                          label="account"
                          isOwner={session.role === "OWNER"}
                          confirmMessage={`Permanently delete ${s.name}? Their login is removed and they're hidden everywhere — this can't be undone.`}
                          requestMessage={`Request permanent deletion of ${s.name}? An Owner will need to approve it before anything happens.`}
                        />
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
