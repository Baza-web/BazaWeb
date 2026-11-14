import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canRecordSale, isCompanyWide } from "@/lib/rbac";
import { SaleForm } from "@/components/SaleForm";

export default async function NewSalePage() {
  const session = await requireSessionOrRedirect();
  if (!canRecordSale(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const scope = branchScope(session);
  const defaultBranchId = session.branchId ?? "";

  const [inventory, customers, branches] = await Promise.all([
    db.inventoryItem.findMany({
      where: { ...scope, status: "IN_STOCK", quantity: { gt: 0 } },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({ where: scope, orderBy: { name: "asc" }, select: { id: true, name: true, branchId: true } }),
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="page-title">New sale</h1>
      <SaleForm
        inventory={inventory.map((i) => ({
          id: i.id,
          sku: i.sku,
          name: i.name,
          sellingPrice: i.sellingPrice,
          quantity: i.quantity,
          branchId: i.branchId,
        }))}
        customers={customers}
        branches={branches}
        showBranchSelect={isCompanyWide(session.role)}
        defaultBranchId={defaultBranchId}
      />
    </div>
  );
}
