import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate, round2 } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";
import { ExportButton } from "@/components/ExportButton";

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; accountId?: string; branchId?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { from, to, accountId, branchId } = await searchParams;
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  const [accounts, branches, lines] = await Promise.all([
    db.account.findMany({ orderBy: { code: "asc" } }),
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.journalLine.findMany({
      where: {
        ...(accountId ? { accountId } : {}),
        journalEntry: {
          date: { gte: fromDate, lte: toDate },
          ...(isCompanyWide(session.role) ? (branchId ? { branchId } : {}) : { branchId: session.branchId }),
        },
      },
      include: { account: true, journalEntry: { include: { branch: true, createdBy: true } } },
      orderBy: [{ journalEntry: { date: "asc" } }],
    }),
  ]);

  let running = 0;
  const rows = lines.map((l) => {
    running = round2(running + l.debit - l.credit);
    return { ...l, runningBalance: running };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">General Ledger</h1>
          <p className="text-sm text-stone-500">Every posted journal line, in order — the source of truth for all financial reporting.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            href={`/api/export/general-ledger?${new URLSearchParams({
              from: fromDate.toISOString().slice(0, 10),
              to: toDate.toISOString().slice(0, 10),
              ...(accountId ? { accountId } : {}),
              ...(branchId ? { branchId } : {}),
            }).toString()}`}
          />
          <PrintButton selector="#gl-table" label="Print" />
          <Link href="/accounting" className="btn-secondary">
            Back to Accounting
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">General Ledger</h2>
        <p className="text-sm text-stone-500">
          {formatDate(fromDate)} – {formatDate(toDate)} · Printed {formatDate(new Date())} — {rows.length} line(s)
        </p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 print:hidden" action="/accounting/general-ledger">
        <div>
          <label className="label">From</label>
          <input className="input" type="date" name="from" defaultValue={fromDate.toISOString().slice(0, 10)} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" name="to" defaultValue={toDate.toISOString().slice(0, 10)} />
        </div>
        <div>
          <label className="label">Account</label>
          <select className="input" name="accountId" defaultValue={accountId ?? ""}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
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

      <div id="gl-table" className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry #</th>
              <th>Description</th>
              <th>Account</th>
              <th>Debit</th>
              <th>Credit</th>
              {!accountId && <th>Balance</th>}
              {accountId && <th>Running balance</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td>{formatDate(l.journalEntry.date)}</td>
                <td className="font-mono text-xs">
                  <Link href="/accounting/journal-entries" className="text-brand-700 hover:underline">
                    {l.journalEntry.entryNumber}
                  </Link>
                </td>
                <td className="max-w-xs text-xs">{l.journalEntry.description}</td>
                <td className="text-xs">
                  {l.account.code} — {l.account.name}
                </td>
                <td>{l.debit > 0 ? formatMoney(l.debit) : ""}</td>
                <td>{l.credit > 0 ? formatMoney(l.credit) : ""}</td>
                <td className="font-medium">{formatMoney(l.runningBalance)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-stone-400">
                  No journal lines for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
