import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting } from "@/lib/rbac";
import { getAccountingHealth } from "@/lib/accountingHealth";
import { formatMoney } from "@/lib/utils";
import { BackfillButton } from "@/components/BackfillButton";

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />;
}

export default async function HealthCheckPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const health = await getAccountingHealth();
  const allGood =
    health.trialBalanceOk &&
    health.unpostedSales === 0 &&
    health.unpostedExpenses === 0 &&
    health.unbalancedEntryNumbers.length === 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Accounting Health Check</h1>
          <p className="text-sm text-stone-500">Whether the double-entry ledger is internally consistent, right now.</p>
        </div>
        <Link href="/accounting" className="btn-secondary">
          Back to Accounting
        </Link>
      </div>

      {allGood && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">Everything checks out — no issues found.</div>
      )}

      <div className="card space-y-4 divide-y divide-stone-100">
        <div className="flex items-start gap-3 pb-4">
          <StatusDot ok={health.trialBalanceOk} />
          <div>
            <p className="font-medium">Trial balance is balanced</p>
            <p className="text-sm text-stone-500">
              Total debits {formatMoney(health.totalDebit)} vs. total credits {formatMoney(health.totalCredit)}.
            </p>
            {!health.trialBalanceOk && (
              <Link href="/accounting/trial-balance" className="text-sm text-brand-700 hover:underline">
                Open Trial Balance →
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 pt-4 pb-4">
          <StatusDot ok={health.unbalancedEntryNumbers.length === 0} />
          <div>
            <p className="font-medium">Every posted journal entry balances on its own</p>
            {health.unbalancedEntryNumbers.length > 0 ? (
              <p className="text-sm text-red-700">
                Out of balance: {health.unbalancedEntryNumbers.join(", ")} — this should never happen through the normal posting
                path; check for a hand-edited database row.
              </p>
            ) : (
              <p className="text-sm text-stone-500">Checked every entry&apos;s own debit/credit lines.</p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 pt-4 pb-4">
          <StatusDot ok={health.unpostedSales === 0 && health.unpostedExpenses === 0} />
          <div className="w-full">
            <p className="font-medium">Every sale and expense has a journal entry</p>
            <div className="mt-2">
              <BackfillButton unpostedSales={health.unpostedSales} unpostedExpenses={health.unpostedExpenses} />
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 pt-4">
          <StatusDot ok={health.unreconciledBankLines === 0} />
          <div>
            <p className="font-medium">Bank statement lines are reconciled</p>
            <p className="text-sm text-stone-500">
              {health.unreconciledBankLines === 0
                ? "No unreconciled bank statement lines."
                : `${health.unreconciledBankLines} unreconciled line${health.unreconciledBankLines === 1 ? "" : "s"}.`}
            </p>
            <Link href="/accounting/bank-reconciliation" className="text-sm text-brand-700 hover:underline">
              Open Bank Reconciliation →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
