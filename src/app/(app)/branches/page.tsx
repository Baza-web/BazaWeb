import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageStaff } from "@/lib/rbac";
import { createBranch } from "./actions";

export default async function BranchesPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const branches = await db.branch.findMany({
    include: { _count: { select: { staff: true, inventoryItems: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="page-title">Branches</h1>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Phone</th>
              <th>Staff</th>
              <th>Inventory items</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id}>
                <td className="font-medium">{b.name}</td>
                <td>{b.address ?? "—"}</td>
                <td>{b.phone ?? "—"}</td>
                <td>{b._count.staff}</td>
                <td>{b._count.inventoryItems}</td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-stone-400">
                  No branches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card max-w-md">
        <h2 className="mb-3 font-medium">Add a branch</h2>
        <form action={createBranch} className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" name="name" required />
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" name="address" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" name="phone" />
          </div>
          <button type="submit" className="btn-primary">
            Create branch
          </button>
        </form>
      </div>
    </div>
  );
}
