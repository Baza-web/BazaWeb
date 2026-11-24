import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageBrands } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";
import { BrandRenameForm } from "@/components/BrandRenameForm";
import { CreateBrandForm } from "@/components/CreateBrandForm";
import { ToggleBrandActiveButton } from "@/components/ToggleBrandActiveButton";
import { DeleteBrandButton } from "@/components/DeleteBrandButton";

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
      <div className="flex items-start justify-between gap-4">
        <div className="print:hidden">
          <h1 className="page-title">Brands</h1>
          <p className="text-sm text-stone-500">
            The house brands this business trades under — used to organize Creative planning and Accounting across
            your different lines. Separate from Branches, which are physical locations.
          </p>
        </div>
        <PrintButton selector="#brands-table" />
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Brands</h2>
        <p className="text-sm text-stone-500">Printed {formatDate(new Date())} — {brands.length} brand(s)</p>
      </div>

      {pendingBrandRequests.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
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

      <div className="card max-w-sm print:hidden">
        <h2 className="mb-3 font-medium">Add a brand</h2>
        <CreateBrandForm />
      </div>

      <div id="brands-table" className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
              <th>Name</th>
              <th>Added</th>
              <th>Used in</th>
              <th>Status</th>
              <th className="print:hidden">Actions</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id} data-print-row className={b.active ? undefined : "opacity-60"}>
                <td className="print:hidden">
                  <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include ${b.name} in print`} />
                </td>
                <td className="font-medium">
                  <div className="flex items-center gap-2">
                    <Link href={`/brands/${b.id}`} className="text-brand-700 hover:underline">
                      {b.name}
                    </Link>
                    <span className="print:hidden">
                      <BrandRenameForm brandId={b.id} name={b.name} />
                    </span>
                  </div>
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
                <td className="print:hidden">
                  <div className="flex flex-wrap items-center gap-2">
                    <ToggleBrandActiveButton brandId={b.id} active={b.active} />
                    <DeleteBrandButton brandId={b.id} brandName={b.name} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
