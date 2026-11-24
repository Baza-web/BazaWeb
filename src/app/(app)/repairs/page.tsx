import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canManageRepairs, canEditDeleteRepairs, isCompanyWide } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";
import { Wrench } from "@phosphor-icons/react/ssr";
import { PrintButton } from "@/components/PrintButton";
import { CreateRepairOrderForm } from "@/components/CreateRepairOrderForm";
import { RepairOrderRow } from "@/components/RepairOrderRow";

export default async function RepairsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const canManage = canManageRepairs(session.role);
  const canEditDelete = canEditDeleteRepairs(session.role);
  const canUpdateStatus = canManage || session.role === "CRAFTSMAN";
  if (!canUpdateStatus) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }
  const { status } = await searchParams;

  const scope = branchScope(session);

  const [orders, customers, branches, craftsmen, salesStaff, products] = await Promise.all([
    db.repairOrder.findMany({
      where: {
        ...(session.role === "CRAFTSMAN" ? { assignedToId: session.staffId } : scope),
        ...(status ? { status: status as never } : {}),
      },
      include: { customer: true, assignedTo: true, assignedSales: true, branch: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    canManage
      ? db.customer.findMany({ where: scope, orderBy: { name: "asc" }, take: 500 })
      : Promise.resolve([]),
    canManage && isCompanyWide(session.role)
      ? db.branch.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
    canManage
      ? db.staff.findMany({
          where: { role: "CRAFTSMAN", active: true, ...(isCompanyWide(session.role) ? {} : { branchId: session.branchId }) },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    canManage
      ? db.staff.findMany({
          where: { role: "SALES", active: true, ...(isCompanyWide(session.role) ? {} : { branchId: session.branchId }) },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    canManage
      ? db.inventoryItem.findMany({
          where: { status: "IN_STOCK", ...scope },
          select: { id: true, name: true, sku: true, sellingPrice: true, branchId: true },
          orderBy: { name: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="page-title print:hidden">Repairs &amp; Custom Orders</h1>

      {canManage && (
        <div className="card max-w-2xl print:hidden">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Wrench size={18} className="text-brand-500" aria-hidden="true" />
            Intake new order
          </h2>
          <CreateRepairOrderForm
            isCompanyWide={isCompanyWide(session.role)}
            defaultBranchId={session.branchId ?? ""}
            branches={branches}
            customers={customers}
            products={products}
            craftsmen={craftsmen}
            salesStaff={salesStaff}
          />
        </div>
      )}

      <div id="repairs-table" className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title print:hidden">
            {session.role === "CRAFTSMAN" ? "Assigned to me" : "All orders"}
          </h2>
          <form action="/repairs" className="flex gap-2 print:hidden">
            <select className="input text-sm" name="status" defaultValue={status ?? ""}>
              <option value="">All statuses</option>
              <option value="RECEIVED">Received</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="READY">Ready</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <button type="submit" className="btn-secondary text-sm">
              Filter
            </button>
          </form>
          <PrintButton selector="#repairs-table" label="Print" />
        </div>

        <div className="print-report-header">
          <h2 className="font-display text-xl font-semibold">
            {session.role === "CRAFTSMAN" ? "Assigned to me" : "Repairs & custom orders"}
          </h2>
          <p className="text-sm text-stone-500">
            {status ? `Status: ${status.replace("_", " ")} — ` : ""}Printed {formatDate(new Date())} — {orders.length} order(s)
          </p>
        </div>

        {orders.length === 0 ? (
          <p className="text-sm text-stone-400">No orders yet.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-8 print:hidden">
                  <span className="sr-only">Include in print</span>
                </th>
                <th>Customer</th>
                <th>Type</th>
                <th>Description</th>
                <th>Promised</th>
                <th>Cost</th>
                <th>Craftsman</th>
                <th>Sales</th>
                <th>Status</th>
                {canUpdateStatus && <th className="print:hidden">Update</th>}
                {canEditDelete && <th className="print:hidden">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const canUpdateThis =
                  canManage || (session.role === "CRAFTSMAN" && order.assignedToId === session.staffId);
                return (
                  <RepairOrderRow
                    key={order.id}
                    order={order}
                    showBranch={isCompanyWide(session.role)}
                    canManage={canManage}
                    canEditDelete={canEditDelete}
                    canUpdateThis={canUpdateThis}
                    craftsmanOptions={craftsmen.filter((c) => c.branchId === order.branchId)}
                    salesOptions={salesStaff.filter((s) => s.branchId === order.branchId)}
                    productOptions={products.filter((p) => p.branchId === order.branchId)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
