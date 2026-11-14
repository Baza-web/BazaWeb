import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import {
  canManageStaffScoped,
  isCompanyWide,
  MANAGER_GRANTABLE_ROLES,
  ROLE_LABELS,
} from "@/lib/rbac";
import { createStaff } from "../actions";

const ALL_ROLES = Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[];

export default async function NewStaffPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const companyWide = isCompanyWide(session.role);
  const assignableRoles = companyWide ? ALL_ROLES : MANAGER_GRANTABLE_ROLES;
  const branches = companyWide ? await db.branch.findMany({ orderBy: { name: "asc" } }) : [];

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="page-title">Add a staff account</h1>
      {!companyWide && (
        <p className="-mt-4 text-sm text-stone-500">
          You can create Branch Manager, Sales, and Craftsman accounts for your own branch.
        </p>
      )}

      <form action={createStaff} className="card space-y-4">
        <div>
          <label className="label">Full name</label>
          <input className="input" name="name" required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" name="email" type="email" required />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" name="phone" />
        </div>
        <div>
          <label className="label">Temporary password</label>
          <input className="input" name="password" type="text" minLength={8} required />
          <p className="mt-1 text-xs text-stone-400">
            Share this with them directly; they can&apos;t reset it themselves yet.
          </p>
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" name="role" required defaultValue={companyWide ? "SALES" : "SALES"}>
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        {companyWide ? (
          <div>
            <label className="label">Branch</label>
            <select className="input" name="branchId" required>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="branchId" value={session.branchId ?? ""} />
        )}
        <button type="submit" className="btn-primary">
          Create account
        </button>
      </form>
    </div>
  );
}
