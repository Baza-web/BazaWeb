import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate, round2 } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";

export default async function TrialBalancePage({
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

  const [branches, accounts] = await Promise.all([
    isCompanyWide(session.roles) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.account.findMany({
      include: {
        journalLines: {
          where: {
            journalEntry: {
              date: { lte: asOfDate },
              ...(isCompanyWide(session.roles) ? (branchId ? { branchId } : {}) : { branchId: session.branchId }),
            },
          },
        },
      },
      orderBy: { code: "asc" },
    }),
  ]);

  const rows = accounts
    .map((a) => {
      const totalDebit = round2(a.journalLines.reduce((s, l) => s + l.debit, 0));
      const totalCredit = round2(a.journalLines.reduce((s, l) => s + l.credit, 0));
      return { account: a, totalDebit, totalCredit };
    })
    .filter((r) => r.totalDebit !== 0 || r.totalCredit !== 0);

  const grandDebit = round2(rows.reduce((s, r) => s + r.totalDebit, 0));
  const grandCredit = round2(rows.reduce((s, r) => s + r.totalCredit, 0));
  const balanced = grandDebit === grandCredit;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">Trial Balance</h1>
          <p className="text-sm text-stone-500">Every account&apos;s total debits and credits — must always balance.</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton selector="#trial-balance-table" label="Print" />
          <Link href="/accounting" className="btn-secondary">
            Back to Accounting
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Trial Balance</h2>
        <p className="text-sm text-stone-500">As of {formatDate(asOfDate)} · Printed {formatDate(new Date())}</p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 print:hidden" action="/accounting/trial-balance">
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
          Out of balance by {formatMoney(Math.abs(round2(grandDebit - grandCredit)))} — this should never happen if
          every entry was posted through the journal entry form. Check for a partially-migrated or hand-edited row.
        </div>
      )}

      <div id="trial-balance-table" className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account.id}>
                <td className="font-mono text-xs">{r.account.code}</td>
                <td className="font-medium">{r.account.name}</td>
                <td>{r.totalDebit > 0 ? formatMoney(r.totalDebit) : ""}</td>
                <td>{r.totalCredit > 0 ? formatMoney(r.totalCredit) : ""}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-stone-400">
                  No posted journal entries yet.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={2}>Total</td>
                <td className={balanced ? "text-green-700" : "text-red-700"}>{formatMoney(grandDebit)}</td>
                <td className={balanced ? "text-green-700" : "text-red-700"}>{formatMoney(grandCredit)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
