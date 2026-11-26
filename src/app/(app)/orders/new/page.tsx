import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canCreateOrders, isCompanyWide } from "@/lib/rbac";
import { OrderForm } from "@/components/OrderForm";
import { Plus } from "@/components/icons";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ whatsappOrderId?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canCreateOrders(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { whatsappOrderId } = await searchParams;
  const scope = branchScope(session);

  const [brands, customers, staffList, branches, departmentRows] = await Promise.all([
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: scope, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true, branchId: true } }),
    isCompanyWide(session.roles)
      ? db.staff.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : db.staff.findMany({ where: { active: true, branchId: session.branchId ?? undefined }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    isCompanyWide(session.roles) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.order.findMany({ where: { department: { not: null } }, select: { department: true }, distinct: ["department"] }),
  ]);

  const departments = departmentRows.map((d) => d.department).filter(Boolean) as string[];
  const defaultDeadline = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Plus size={24} className="text-brand-500" aria-hidden="true" />
          Create New Order
        </h1>
        <p className="text-sm text-stone-500">An order number is generated automatically once saved.</p>
      </div>

      <OrderForm
        brands={brands}
        customers={customers}
        staffList={staffList}
        branches={branches}
        departments={departments}
        showBranchSelect={isCompanyWide(session.roles)}
        defaultBranchId={session.branchId ?? ""}
        defaultDeadline={defaultDeadline}
        whatsappOrderId={whatsappOrderId}
      />
    </div>
  );
}
