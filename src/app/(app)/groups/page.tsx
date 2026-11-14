import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canManageGroups, isCompanyWide } from "@/lib/rbac";
import { initials } from "@/lib/utils";
import { createGroup, addGroupMember, removeGroupMember } from "./actions";
import { UsersFour, X } from "@/components/icons";

export default async function GroupsPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageGroups(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const scope = branchScope(session);

  const [groups, branches, staff] = await Promise.all([
    db.staffGroup.findMany({
      where: scope,
      include: { members: true, branch: true },
      orderBy: { createdAt: "desc" },
    }),
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.staff.findMany({ where: { ...scope, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="page-title">Staff Groups</h1>
      <p className="text-sm text-stone-500">
        Group staff who work together on the same projects — a task assigned to a group is visible
        to, and can be updated by, every member.
      </p>

      <div className="card max-w-md">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <UsersFour size={18} className="text-brand-500" aria-hidden="true" />
          New group
        </h2>
        <form action={createGroup} className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" name="name" required placeholder="Custom Orders Team" />
          </div>
          {isCompanyWide(session.role) && (
            <div>
              <label className="label">Branch</label>
              <select className="input" name="branchId" required defaultValue={session.branchId ?? ""}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="btn-primary">
            Create group
          </button>
        </form>
      </div>

      <div className="space-y-4">
        {groups.length === 0 && (
          <p className="card text-sm text-stone-400">No groups yet — create one above.</p>
        )}
        {groups.map((group) => {
          const branchStaff = staff.filter(
            (s) => s.branchId === group.branchId && !group.members.some((m) => m.id === s.id),
          );
          return (
            <div key={group.id} className="card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium text-ink-900">{group.name}</h3>
                {isCompanyWide(session.role) && (
                  <span className="text-xs text-stone-400">{group.branch.name}</span>
                )}
              </div>

              <ul className="mb-3 space-y-2">
                {group.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="avatar h-7 w-7 text-xs">{initials(m.name)}</span>
                      <span className="text-sm">{m.name}</span>
                    </div>
                    <form action={removeGroupMember.bind(null, group.id)}>
                      <input type="hidden" name="staffId" value={m.id} />
                      <button
                        type="submit"
                        aria-label={`Remove ${m.name}`}
                        className="cursor-pointer rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </form>
                  </li>
                ))}
                {group.members.length === 0 && (
                  <li className="text-sm text-stone-400">No members yet.</li>
                )}
              </ul>

              {branchStaff.length > 0 && (
                <form action={addGroupMember.bind(null, group.id)} className="flex gap-2">
                  <select className="input text-sm" name="staffId" required defaultValue="">
                    <option value="" disabled>
                      Add member…
                    </option>
                    {branchStaff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-secondary text-sm">
                    Add
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
