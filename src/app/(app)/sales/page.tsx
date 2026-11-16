import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canRecordSale } from "@/lib/rbac";
import { formatMoney, formatDate } from "@/lib/utils";
import { Plus } from "@phosphor-icons/react/ssr";
import { PrintButton } from "@/components/PrintButton";
import { ExportButton } from "@/components/ExportButton";

const PAYMENT_COLORS: Record<string, string> = {
  PAID: "bg-green-100 text-green-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  UNPAID: "bg-red-50 text-red-700",
};

export default async function SalesPage() {
  const session = await requireSessionOrRedirect();
  if (!canRecordSale(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const sales = await db.sale.findMany({
    where: branchScope(session),
    include: { customer: true, branch: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Sales</h1>
        <div className="flex items-center gap-2">
          <ExportButton href="/api/export/sales" />
          <PrintButton selector="#sales-table" />
          {canRecordSale(session.role) && (
            <Link href="/sales/new" className="btn-primary print:hidden">
              <Plus size={16} aria-hidden="true" />
              New sale
            </Link>
          )}
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Sales report</h2>
        <p className="text-sm text-stone-500">Printed {formatDate(new Date())} — {sales.length} sale(s)</p>
      </div>

      <div id="sales-table" className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
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
              <tr key={s.id} data-print-row>
                <td className="print:hidden">
                  <input
                    type="checkbox"
                    data-print-checkbox
                    defaultChecked
                    className="h-4 w-4 rounded border-stone-300"
                    aria-label={`Include invoice ${s.invoiceNumber} in print`}
                  />
                </td>
                <td>
                  <Link href={`/sales/${s.id}`} className="text-brand-700 hover:underline print:text-ink-900 print:no-underline">
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
                <td colSpan={7} className="py-6 text-center text-stone-400">
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
