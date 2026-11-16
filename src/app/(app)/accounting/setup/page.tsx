import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting } from "@/lib/rbac";
import { getAccountingHealth } from "@/lib/accountingHealth";
import { seedDefaultChartOfAccounts } from "../chart-of-accounts/actions";
import { OpeningBalancesForm } from "@/components/OpeningBalancesForm";
import { BackfillButton } from "@/components/BackfillButton";

export default async function AccountingSetupPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const [accountCount, openingAlready, health] = await Promise.all([
    db.account.count(),
    db.journalEntry.findFirst({ where: { reference: "OPENING-BALANCES" } }),
    getAccountingHealth(),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Accounting Setup</h1>
          <p className="text-sm text-stone-500">A one-time walkthrough to get the double-entry ledger ready to rely on.</p>
        </div>
        <Link href="/accounting" className="btn-secondary">
          Back to Accounting
        </Link>
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">1. Chart of Accounts</h2>
        {accountCount > 0 ? (
          <p className="text-sm text-green-700">{accountCount} accounts are set up.</p>
        ) : (
          <>
            <p className="text-sm text-stone-500">Seed the default chart of accounts to get started.</p>
            <form action={seedDefaultChartOfAccounts}>
              <button type="submit" className="btn-primary">
                Seed default accounts
              </button>
            </form>
          </>
        )}
        <Link href="/accounting/chart-of-accounts" className="text-sm text-brand-700 hover:underline">
          Review or customize the chart of accounts →
        </Link>
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">2. Opening balances</h2>
        <p className="text-sm text-stone-500">
          If the business was already running before this ledger existed, enter what it actually had on a given date — what&apos;s
          already recorded as Sales/Expenses from that point on stays untouched.
        </p>
        <OpeningBalancesForm defaultDate={new Date().toISOString().slice(0, 10)} disabled={!!openingAlready} />
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">3. Backfill historic transactions</h2>
        <p className="text-sm text-stone-500">
          Sales and expenses recorded before auto-posting existed have no journal entry yet — post them now, using each one&apos;s
          original date, so the ledger reflects the full history.
        </p>
        <BackfillButton unpostedSales={health.unpostedSales} unpostedExpenses={health.unpostedExpenses} />
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">4. Check everything&apos;s healthy</h2>
        <p className="text-sm text-stone-500">Once the steps above are done, confirm the books are internally consistent.</p>
        <Link href="/accounting/health-check" className="btn-secondary">
          Open Health Check
        </Link>
      </div>
    </div>
  );
}
