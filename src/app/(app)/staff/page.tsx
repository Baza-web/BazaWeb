import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageStaffScoped, branchScope, ROLE_LABELS } from "@/lib/rbac";
import { toggleStaffActive } from "./actions";
import { Plus } from "@phosphor-icons/react/ssr";

export default async function StaffPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const staff = await db.staff.findMany({
    where: branchScope(session),
    include: { branch: true },
    orderBy: { createdAt: "asc" },
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
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.name}</td>
                <td>{s.email}</td>
                <td>{ROLE_LABELS[s.role]}</td>
                <td>{s.branch?.name ?? "—"}</td>
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
                    <form action={toggleStaffActive.bind(null, s.id)}>
                      <button type="submit" className="btn-secondary text-xs">
                        {s.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
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
