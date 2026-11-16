import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting } from "@/lib/rbac";
import { formatMoney } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";
import { BankStatementUploadForm } from "@/components/BankStatementUploadForm";
import { BankLineRow } from "@/components/BankLineRow";

const CASH_CODES = ["1000", "1010", "1020"];

export default async function BankReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { accountId: filterAccountId } = await searchParams;

  const cashAccounts = await db.account.findMany({
    where: { code: { in: CASH_CODES } },
    orderBy: { code: "asc" },
  });
  const activeAccountId = filterAccountId || cashAccounts[0]?.id;

  const [bankLines, unmatchedJournalLines] = activeAccountId
    ? await Promise.all([
        db.bankStatementLine.findMany({
          where: { accountId: activeAccountId },
          include: { matchedJournalLine: { include: { journalEntry: true } } },
          orderBy: [{ reconciled: "asc" }, { date: "desc" }],
        }),
        db.journalLine.findMany({
          where: { accountId: activeAccountId, matchedBankLine: null },
          include: { journalEntry: true },
          orderBy: { journalEntry: { date: "desc" } },
        }),
      ])
    : [[], []];

  const unmatchedCount = bankLines.filter((l) => !l.reconciled).length;
  const reconciledCount = bankLines.length - unmatchedCount;
  const unmatchedTotal = bankLines.filter((l) => !l.reconciled).reduce((s, l) => s + l.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">Bank Reconciliation</h1>
          <p className="text-sm text-stone-500">Match an uploaded bank statement against what&apos;s already posted in the ledger.</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton selector="#bank-recon-table" label="Print" />
          <Link href="/accounting" className="btn-secondary">
            Back to Accounting
          </Link>
        </div>
      </div>

      <BankStatementUploadForm
        accounts={cashAccounts}
        googleClientId={process.env.GOOGLE_CLIENT_ID}
        googlePickerApiKey={process.env.GOOGLE_PICKER_API_KEY}
      />

      <form className="card flex flex-wrap items-end gap-3 print:hidden" action="/accounting/bank-reconciliation">
        <div>
          <label className="label">Account</label>
          <select className="input" name="accountId" defaultValue={activeAccountId ?? ""}>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Apply
        </button>
      </form>

      {!activeAccountId ? (
        <p className="text-sm text-stone-500">No Cash/Bank account found — run the Chart of Accounts seed first.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Unmatched lines</p>
              <p className="mt-1 text-2xl font-semibold">{unmatchedCount}</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Unmatched amount</p>
              <p className="mt-1 text-2xl font-semibold">{formatMoney(unmatchedTotal)}</p>
            </div>
            <div className="card">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Reconciled lines</p>
              <p className="mt-1 text-2xl font-semibold text-green-700">{reconciledCount}</p>
            </div>
          </div>

          <div id="bank-recon-table" className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Match</th>
                </tr>
              </thead>
              <tbody>
                {bankLines.map((l) => {
                  const candidates = unmatchedJournalLines
                    .filter((jl) => Math.round((jl.debit - jl.credit) * 100) === Math.round(l.amount * 100))
                    .map((jl) => ({
                      id: jl.id,
                      entryNumber: jl.journalEntry.entryNumber,
                      description: jl.journalEntry.description,
                      date: jl.journalEntry.date.toISOString(),
                      movement: jl.debit - jl.credit,
                    }));
                  return (
                    <BankLineRow
                      key={l.id}
                      bankLineId={l.id}
                      date={l.date.toISOString()}
                      description={l.description}
                      amount={l.amount}
                      reconciled={l.reconciled}
                      matchedEntryNumber={l.matchedJournalLine?.journalEntry.entryNumber}
                      candidates={l.reconciled ? [] : candidates}
                    />
                  );
                })}
                {bankLines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-stone-400">
                      No statement lines uploaded for this account yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
