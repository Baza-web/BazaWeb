import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageBrands } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";
import { createBrand, toggleBrandActive } from "./actions";

export default async function BrandsPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const [brands, pendingBrandRequests] = await Promise.all([
    db.brand.findMany({
      include: { _count: { select: { staff: true, socialPosts: true, sales: true, expenses: true } } },
      orderBy: { name: "asc" },
    }),
    db.editRequest.findMany({ where: { entityType: "BRAND", status: "PENDING" } }),
  ]);
  const pendingToggleBrandIds = new Set(pendingBrandRequests.filter((r) => !(r.proposedData as { __create?: boolean })?.__create).map((r) => r.entityId));
  const pendingNewBrands = pendingBrandRequests.filter((r) => (r.proposedData as { __create?: boolean })?.__create);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="page-title">Brands</h1>
        <p className="text-sm text-stone-500">
          The house brands this business trades under — used to organize Creative planning and Accounting across
          your different lines. Separate from Branches, which are physical locations.
        </p>
      </div>

      {pendingBrandRequests.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">
            {pendingBrandRequests.length} brand {pendingBrandRequests.length === 1 ? "change is" : "changes are"}{" "}
            awaiting Owner approval
          </p>
          {pendingNewBrands.length > 0 && (
            <p className="mt-1 text-amber-700">
              Pending new brands: {pendingNewBrands.map((r) => r.entityLabel).join(", ")}
            </p>
          )}
          {session.role === "OWNER" && (
            <Link href="/edit-requests" className="mt-1 inline-block text-amber-800 underline">
              Review now
            </Link>
          )}
        </div>
      )}

      <div className="card max-w-sm">
        <h2 className="mb-3 font-medium">Add a brand</h2>
        <form action={createBrand} className="flex gap-2">
          <input className="input" name="name" required placeholder="New brand name" />
          <button type="submit" className="btn-primary">
            Add
          </button>
        </form>
        {session.role !== "OWNER" && (
          <p className="mt-2 text-xs text-stone-400">Adding a brand will need an Owner to approve it first.</p>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Name</th>
              <th>Added</th>
              <th>Used in</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id} className={b.active ? undefined : "opacity-60"}>
                <td className="font-medium">
                  <Link href={`/brands/${b.id}`} className="text-brand-700 hover:underline">
                    {b.name}
                  </Link>
                </td>
                <td>{formatDate(b.createdAt)}</td>
                <td className="text-xs text-stone-500">
                  {b._count.staff} staff · {b._count.socialPosts} posts · {b._count.sales} sales ·{" "}
                  {b._count.expenses} expenses
                </td>
                <td>
                  <span className={`badge ${b.active ? "bg-green-100 text-green-700" : "bg-stone-200 text-stone-600"}`}>
                    {b.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td>
                  <form action={toggleBrandActive.bind(null, b.id)}>
                    <button type="submit" className="btn-secondary text-xs">
                      {b.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
