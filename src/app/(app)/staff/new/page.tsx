import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageStaff, ROLE_LABELS } from "@/lib/rbac";
import { createStaff } from "../actions";

const ROLES = Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[];

export default async function NewStaffPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const branches = await db.branch.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="page-title">Add a staff account</h1>

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
          <select className="input" name="role" required defaultValue="SALES">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
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
        <button type="submit" className="btn-primary">
          Create account
        </button>
      </form>
    </div>
  );
}
