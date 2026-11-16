import Link from "next/link";
import { Fragment } from "react";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate } from "@/lib/utils";
import { JournalEntryForm } from "@/components/JournalEntryForm";
import { reverseEntry } from "./actions";
import { PrintButton } from "@/components/PrintButton";

export default async function JournalEntriesPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const [accounts, branches, entries] = await Promise.all([
    db.account.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.journalEntry.findMany({
      include: { lines: { include: { account: true } }, createdBy: true, branch: true, reversedBy: true },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">Journal Entries</h1>
          <p className="text-sm text-stone-500">Manual double-entry postings — total debits must equal total credits.</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton selector="#journal-entries-table" label="Print" />
          <Link href="/accounting" className="btn-secondary">
            Back to Accounting
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Journal Entries</h2>
        <p className="text-sm text-stone-500">Printed {formatDate(new Date())} — {entries.length} entries shown</p>
      </div>

      {accounts.length === 0 ? (
        <div className="card print:hidden">
          <p className="text-sm text-stone-500">
            No accounts set up yet — go to{" "}
            <Link href="/accounting/chart-of-accounts" className="text-brand-700 hover:underline">
              Chart of Accounts
            </Link>{" "}
            first.
          </p>
        </div>
      ) : (
        <div className="card print:hidden">
          <h2 className="mb-3 font-medium">New entry</h2>
          <JournalEntryForm
            accounts={accounts}
            branches={branches}
            showBranchSelect={isCompanyWide(session.role)}
            defaultBranchId={session.branchId ?? ""}
          />
        </div>
      )}

      <div id="journal-entries-table" className="card overflow-x-auto">
        <h2 className="mb-3 font-medium print:hidden">Recent entries</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry #</th>
              <th>Description</th>
              <th>Account</th>
              <th>Debit</th>
              <th>Credit</th>
              <th className="print:hidden">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <Fragment key={entry.id}>
                {entry.lines.map((line, i) => (
                  <tr key={line.id} className={entry.reversalOfId ? "text-stone-400" : undefined}>
                    {i === 0 && (
                      <>
                        <td rowSpan={entry.lines.length}>{formatDate(entry.date)}</td>
                        <td rowSpan={entry.lines.length} className="font-mono text-xs">
                          {entry.entryNumber}
                          {entry.reversalOfId && <span className="ml-1 text-amber-600">(reversal)</span>}
                        </td>
                        <td rowSpan={entry.lines.length} className="max-w-xs text-xs">
                          {entry.description}
                        </td>
                      </>
                    )}
                    <td className="text-xs">
                      {line.account.code} — {line.account.name}
                    </td>
                    <td>{line.debit > 0 ? formatMoney(line.debit) : ""}</td>
                    <td>{line.credit > 0 ? formatMoney(line.credit) : ""}</td>
                    {i === 0 && (
                      <td rowSpan={entry.lines.length} className="print:hidden">
                        {!entry.reversalOfId && !entry.reversedBy && (
                          <form action={reverseEntry.bind(null, entry.id)}>
                            <button type="submit" className="text-xs text-amber-700 hover:underline">
                              Reverse
                            </button>
                          </form>
                        )}
                        {entry.reversedBy && <span className="text-xs text-stone-400">Reversed</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </Fragment>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-stone-400">
                  No journal entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
