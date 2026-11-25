import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { getApAging, AGING_BUCKETS } from "@/lib/financialStatements";
import { formatMoney, formatDate } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";
import { ExportButton } from "@/components/ExportButton";

export default async function ApAgingPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string; branchId?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { asOf, branchId } = await searchParams;
  const asOfDate = asOf ? new Date(asOf) : new Date();
  asOfDate.setHours(23, 59, 59, 999);

  const [branches, aging] = await Promise.all([
    isCompanyWide(session.roles) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    getApAging(session, asOfDate, branchId),
  ]);
  const { supplierRows, grandTotal, bucketTotals } = aging;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">Accounts Payable Aging</h1>
          <p className="text-sm text-stone-500">What the business owes suppliers, and how long it&apos;s been outstanding.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            href={`/api/export/ap-aging?${new URLSearchParams({
              asOf: asOfDate.toISOString().slice(0, 10),
              ...(branchId ? { branchId } : {}),
            }).toString()}`}
          />
          <PrintButton selector="#ap-aging-table" label="Print" />
          <Link href="/accounting" className="btn-secondary">
            Back to Accounting
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Accounts Payable Aging</h2>
        <p className="text-sm text-stone-500">As of {formatDate(asOfDate)} · Printed {formatDate(new Date())}</p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 print:hidden" action="/accounting/ap-aging">
        <div>
          <label className="label">As of</label>
          <input className="input" type="date" name="asOf" defaultValue={asOfDate.toISOString().slice(0, 10)} />
        </div>
        {isCompanyWide(session.roles) && (
          <div>
            <label className="label">Branch</label>
            <select className="input" name="branchId" defaultValue={branchId ?? ""}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="btn-secondary">
          Apply
        </button>
      </form>

      <div id="ap-aging-table" className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Supplier</th>
              {AGING_BUCKETS.map((b) => (
                <th key={b}>{b}</th>
              ))}
              <th>Total owed</th>
            </tr>
          </thead>
          <tbody>
            {supplierRows.map((r) => (
              <tr key={r.key}>
                <td className="font-medium">
                  {r.name}
                  <span className="ml-1 text-xs text-stone-400">
                    ({r.orderCount} order{r.orderCount === 1 ? "" : "s"})
                  </span>
                </td>
                {AGING_BUCKETS.map((b) => (
                  <td key={b} className={r.buckets[b] > 0 && b !== "Current (0-30)" ? "text-red-700" : ""}>
                    {r.buckets[b] > 0 ? formatMoney(r.buckets[b]) : ""}
                  </td>
                ))}
                <td className="font-semibold">{formatMoney(r.total)}</td>
              </tr>
            ))}
            {supplierRows.length === 0 && (
              <tr>
                <td colSpan={AGING_BUCKETS.length + 2} className="py-6 text-center text-stone-400">
                  No outstanding supplier balances.
                </td>
              </tr>
            )}
          </tbody>
          {supplierRows.length > 0 && (
            <tfoot>
              <tr className="font-semibold">
                <td>Total</td>
                {AGING_BUCKETS.map((b) => (
                  <td key={b}>{formatMoney(bucketTotals[b])}</td>
                ))}
                <td>{formatMoney(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
