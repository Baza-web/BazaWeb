import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageStaff, canAddOrDeleteBranches } from "@/lib/rbac";
import { GeofenceForm } from "@/components/GeofenceForm";
import { DeleteBranchButton } from "@/components/DeleteBranchButton";
import { createBranch, setMainBranch } from "./actions";
import { PrintButton } from "@/components/PrintButton";
import { formatDate } from "@/lib/utils";

export default async function BranchesPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }
  const canAddOrDelete = canAddOrDeleteBranches(session.role);

  const branches = await db.branch.findMany({
    include: { _count: { select: { staff: true, inventoryItems: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title print:hidden">Branches</h1>
        <PrintButton selector="#branches-table" />
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Branches</h2>
        <p className="text-sm text-stone-500">Printed {formatDate(new Date())} — {branches.length} branch(es)</p>
      </div>

      <div id="branches-table" className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
              <th>Name</th>
              <th>Address</th>
              <th>Phone</th>
              <th>Staff</th>
              <th>Inventory items</th>
              <th>Main location</th>
              {canAddOrDelete && <th className="print:hidden">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} data-print-row>
                <td className="print:hidden">
                  <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include ${b.name} in print`} />
                </td>
                <td className="font-medium">{b.name}</td>
                <td>{b.address ?? "—"}</td>
                <td>{b.phone ?? "—"}</td>
                <td>{b._count.staff}</td>
                <td>{b._count.inventoryItems}</td>
                <td>
                  {b.isMain ? (
                    <span className="badge bg-brand-50 text-brand-700">Main</span>
                  ) : (
                    <form action={setMainBranch.bind(null, b.id)}>
                      <button type="submit" className="text-xs text-brand-700 hover:underline">
                        Set as main
                      </button>
                    </form>
                  )}
                </td>
                {canAddOrDelete && (
                  <td className="print:hidden">
                    <DeleteBranchButton branchId={b.id} branchName={b.name} />
                  </td>
                )}
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan={canAddOrDelete ? 8 : 7} className="py-6 text-center text-stone-400">
                  No branches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card space-y-4 print:hidden">
        <div>
          <h2 className="section-title">Clock-in location (geofence)</h2>
          <p className="text-sm text-stone-500">
            Set a branch's coordinates and radius to require staff to be physically there to clock in
            or out. Leave all three blank to disable the requirement for that branch — their location
            is still recorded either way.
          </p>
        </div>
        {branches.map((b) => (
          <div key={b.id} className="border-t border-stone-100 pt-3 first:border-t-0 first:pt-0">
            <p className="mb-2 text-sm font-medium">{b.name}</p>
            <GeofenceForm
              branchId={b.id}
              latitude={b.latitude}
              longitude={b.longitude}
              geofenceRadiusM={b.geofenceRadiusM}
              googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null}
            />
          </div>
        ))}
      </div>

      {canAddOrDelete && (
        <div className="card max-w-md print:hidden">
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
      )}
    </div>
  );
}
