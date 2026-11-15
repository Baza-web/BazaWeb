import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageStaffScoped, canManageStaff, branchScope, ROLE_LABELS } from "@/lib/rbac";
import { toggleStaffActive, deleteStaffPermanently } from "./actions";
import { DeleteRecordButton } from "@/components/DeleteRecordButton";
import { Plus } from "@phosphor-icons/react/ssr";

export default async function StaffPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }
  const canDelete = canManageStaff(session.role);

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
        <Link href="/staff/new" className="btn-primary">
          <Plus size={16} aria-hidden="true" />
          Add staff
        </Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Branch</th>
              <th>Brands</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className={s.active ? undefined : "opacity-60"}>
                <td className="font-medium">
                  <Link href={`/staff/${s.id}`} className="text-brand-700 hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td>{s.email}</td>
                <td>{ROLE_LABELS[s.role]}</td>
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
                <td>
                  {s.id !== session.staffId && (
                    <div className="flex items-center gap-3">
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
