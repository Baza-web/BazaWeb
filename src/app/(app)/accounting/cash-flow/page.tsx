import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { getCashFlow } from "@/lib/financialStatements";
import { formatMoney, formatDate } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";
import { ExportButton } from "@/components/ExportButton";

const CATEGORY_LABEL: Record<string, string> = {
  OPERATING: "Operating activities",
  INVESTING: "Investing activities",
  FINANCING: "Financing activities",
};

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; branchId?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { from, to, branchId } = await searchParams;
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  const [branches, flow] = await Promise.all([
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    getCashFlow(session, fromDate, toDate, branchId),
  ]);
  const { openingCash, buckets, rows, netChange, closingCash } = flow;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">Cash Flow Statement</h1>
          <p className="text-sm text-stone-500">Where cash actually came from and went, over a period (direct method).</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            href={`/api/export/cash-flow?${new URLSearchParams({
              from: fromDate.toISOString().slice(0, 10),
              to: toDate.toISOString().slice(0, 10),
              ...(branchId ? { branchId } : {}),
            }).toString()}`}
          />
          <PrintButton selector="#cash-flow-table" label="Print" />
          <Link href="/accounting" className="btn-secondary">
            Back to Accounting
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Cash Flow Statement</h2>
        <p className="text-sm text-stone-500">
          {formatDate(fromDate)} – {formatDate(toDate)} · Printed {formatDate(new Date())}
        </p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 print:hidden" action="/accounting/cash-flow">
        <div>
          <label className="label">From</label>
          <input className="input" type="date" name="from" defaultValue={fromDate.toISOString().slice(0, 10)} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" name="to" defaultValue={toDate.toISOString().slice(0, 10)} />
        </div>
        {isCompanyWide(session.role) && (
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

      <div id="cash-flow-table" className="card overflow-x-auto">
        <table className="table-base">
          <tbody>
            <tr>
              <td>Opening cash</td>
              <td className="text-right">{formatMoney(openingCash)}</td>
            </tr>
            {(["OPERATING", "INVESTING", "FINANCING"] as const).map((cat) => (
              <tr key={cat}>
                <td>Net cash from {CATEGORY_LABEL[cat].toLowerCase()}</td>
                <td className="text-right">{formatMoney(buckets[cat])}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Net change in cash</td>
              <td className="text-right">{formatMoney(netChange)}</td>
            </tr>
            <tr className="font-semibold">
              <td>Closing cash</td>
              <td className="text-right">{formatMoney(closingCash)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto print:hidden">
        <h3 className="mb-2 font-medium">Cash movements this period</h3>
        <table className="table-base">
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry #</th>
              <th>Description</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.line.id}>
                <td>{formatDate(r.line.journalEntry.date)}</td>
                <td className="font-mono text-xs">{r.line.journalEntry.entryNumber}</td>
                <td className="max-w-xs text-xs">{r.line.journalEntry.description}</td>
                <td className="text-xs">{CATEGORY_LABEL[r.category]}</td>
                <td className={r.movement >= 0 ? "text-green-700" : "text-red-700"}>{formatMoney(r.movement)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-stone-400">
                  No cash movements in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
