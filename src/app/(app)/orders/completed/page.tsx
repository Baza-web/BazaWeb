import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { isCompanyWide, canManageOrdersScoped } from "@/lib/rbac";
import { formatDate, formatMoney } from "@/lib/utils";
import { CheckCircle } from "@/components/icons";

export default async function CompletedOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const manageScoped = canManageOrdersScoped(session.roles);
  const { brand } = await searchParams;

  const scopeWhere = manageScoped
    ? isCompanyWide(session.roles)
      ? {}
      : { branchId: session.branchId ?? undefined }
    : { OR: [{ primaryStaffId: session.staffId }, { supportingStaff: { some: { id: session.staffId } } }] };

  const brands = await db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  const orders = await db.order.findMany({
    where: { ...scopeWhere, status: "COMPLETED", ...(brand ? { brandId: brand } : {}) },
    include: { brand: true, customer: true, primaryStaff: true },
    orderBy: { completedAt: "desc" },
    take: 200,
  });

  const onTimeCount = orders.filter((o) => o.completedAt && o.completedAt.getTime() <= o.currentDeadline.getTime()).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <CheckCircle size={26} className="text-green-600" aria-hidden="true" />
            Completed Orders
          </h1>
          <p className="text-sm text-stone-500">
            {orders.length} completed · {orders.length > 0 ? Math.round((onTimeCount / orders.length) * 100) : 0}% on time
          </p>
        </div>
        <form className="flex items-center gap-2">
          <select className="input text-sm" name="brand" defaultValue={brand ?? ""}>
            <option value="">All Brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button type="submit" className="btn-secondary text-sm">Apply</button>
        </form>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-stone-400">No completed orders yet.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Order</th>
                <th>Brand</th>
                <th>Customer</th>
                <th>Assigned</th>
                <th>Order Value</th>
                <th>Deadline</th>
                <th>Completed</th>
                <th>On Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const onTime = o.completedAt && o.completedAt.getTime() <= o.currentDeadline.getTime();
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.orderNumber}</Link>
                      <p className="text-xs text-stone-500">{o.productOrService}</p>
                    </td>
                    <td>{o.brand?.name ?? "—"}</td>
                    <td>{o.customer?.name ?? o.customerContact ?? "—"}</td>
                    <td>{o.primaryStaff.name}</td>
                    <td>{o.orderValue != null ? formatMoney(o.orderValue) : "—"}</td>
                    <td>{formatDate(o.currentDeadline)}</td>
                    <td>{o.completedAt ? formatDate(o.completedAt) : "—"}</td>
                    <td>
                      <span className={`badge ${onTime ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {onTime ? "On time" : "Delayed"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
