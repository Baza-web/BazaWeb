import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canRecordSale } from "@/lib/rbac";
import { formatMoney, formatDate } from "@/lib/utils";

const PAYMENT_COLORS: Record<string, string> = {
  PAID: "bg-green-100 text-green-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  UNPAID: "bg-red-50 text-red-700",
};

export default async function SalesPage() {
  const session = await requireSessionOrRedirect();

  const sales = await db.sale.findMany({
    where: branchScope(session),
    include: { customer: true, branch: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sales</h1>
        {canRecordSale(session.role) && (
          <Link href="/sales/new" className="btn-primary">
            New sale
          </Link>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Branch</th>
              <th>Total</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/sales/${s.id}`} className="text-brand-700 hover:underline">
                    {s.invoiceNumber}
                  </Link>
                </td>
                <td>{formatDate(s.createdAt)}</td>
                <td>{s.customer?.name ?? "Walk-in"}</td>
                <td>{s.branch.name}</td>
                <td>{formatMoney(s.total)}</td>
                <td>
                  <span className={`badge ${PAYMENT_COLORS[s.paymentStatus]}`}>{s.paymentStatus}</span>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-stone-400">
                  No sales recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
