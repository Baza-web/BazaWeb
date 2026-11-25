import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { getBalanceSheet } from "@/lib/financialStatements";
import { formatMoney, formatDate, round2 } from "@/lib/utils";
import { db } from "@/lib/db";
import { PrintButton } from "@/components/PrintButton";
import { ExportButton } from "@/components/ExportButton";

export default async function BalanceSheetPage({
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

  const [branches, sheet] = await Promise.all([
    isCompanyWide(session.roles) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    getBalanceSheet(session, asOfDate, branchId),
  ]);
  const { assetRows, liabilityRows, equityRows, currentYearEarnings, totalAssets, totalLiabilities, totalEquity, balanced } = sheet;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">Balance Sheet</h1>
          <p className="text-sm text-stone-500">What the business owns, owes, and is worth, as of a single date.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            href={`/api/export/balance-sheet?${new URLSearchParams({
              asOf: asOfDate.toISOString().slice(0, 10),
              ...(branchId ? { branchId } : {}),
            }).toString()}`}
          />
          <PrintButton selector="#balance-sheet-table" label="Print" />
          <Link href="/accounting" className="btn-secondary">
            Back to Accounting
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Balance Sheet</h2>
        <p className="text-sm text-stone-500">As of {formatDate(asOfDate)} · Printed {formatDate(new Date())}</p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 print:hidden" action="/accounting/balance-sheet">
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

      {!balanced && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Assets ({formatMoney(totalAssets)}) don&apos;t equal Liabilities + Equity ({formatMoney(round2(totalLiabilities + totalEquity))}) —
          this should never happen if every entry was posted through the journal. Check the Trial Balance for an unbalanced or
          hand-edited row.
        </div>
      )}

      <div id="balance-sheet-table" className="space-y-4">
        <div className="card overflow-x-auto">
          <h3 className="mb-2 font-medium">Assets</h3>
          <table className="table-base">
            <tbody>
              {assetRows.map((r) => (
                <tr key={r.account.id}>
                  <td className="font-mono text-xs">{r.account.code}</td>
                  <td>{r.account.name}</td>
                  <td className="text-right">{formatMoney(r.balance)}</td>
                </tr>
              ))}
              {assetRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-stone-400">
                    No asset balances yet.
                  </td>
                </tr>
              )}
              <tr className="font-semibold">
                <td colSpan={2}>Total Assets</td>
                <td className="text-right">{formatMoney(totalAssets)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto">
          <h3 className="mb-2 font-medium">Liabilities</h3>
          <table className="table-base">
            <tbody>
              {liabilityRows.map((r) => (
                <tr key={r.account.id}>
                  <td className="font-mono text-xs">{r.account.code}</td>
                  <td>{r.account.name}</td>
                  <td className="text-right">{formatMoney(r.balance)}</td>
                </tr>
              ))}
              {liabilityRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-stone-400">
                    No liabilities yet.
                  </td>
                </tr>
              )}
              <tr className="font-semibold">
                <td colSpan={2}>Total Liabilities</td>
                <td className="text-right">{formatMoney(totalLiabilities)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto">
          <h3 className="mb-2 font-medium">Equity</h3>
          <table className="table-base">
            <tbody>
              {equityRows.map((r) => (
                <tr key={r.account.id}>
                  <td className="font-mono text-xs">{r.account.code}</td>
                  <td>{r.account.name}</td>
                  <td className="text-right">{formatMoney(r.balance)}</td>
                </tr>
              ))}
              <tr>
                <td className="font-mono text-xs">—</td>
                <td>Current Year Earnings (Income − Expenses, to date)</td>
                <td className="text-right">{formatMoney(currentYearEarnings)}</td>
              </tr>
              <tr className="font-semibold">
                <td colSpan={2}>Total Equity</td>
                <td className="text-right">{formatMoney(totalEquity)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="flex justify-between text-sm">
            <span className="text-stone-500">Liabilities + Equity</span>
            <span className={balanced ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
              {formatMoney(round2(totalLiabilities + totalEquity))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
