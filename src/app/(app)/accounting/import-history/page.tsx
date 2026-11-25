import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { HistoricalImportForm } from "@/components/HistoricalImportForm";

export default async function ImportHistoryPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const branches = isCompanyWide(session.roles) ? await db.branch.findMany({ orderBy: { name: "asc" } }) : [];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Import Historical Totals</h1>
          <p className="text-sm text-stone-500">Bring in old months from a previous system, one journal entry per month.</p>
        </div>
        <Link href="/accounting" className="btn-secondary">
          Back to Accounting
        </Link>
      </div>

      <HistoricalImportForm
        branches={branches}
        googleClientId={process.env.GOOGLE_CLIENT_ID}
        googlePickerApiKey={process.env.GOOGLE_PICKER_API_KEY}
      />

      <div className="card overflow-x-auto">
        <h3 className="mb-2 font-medium">Expected format</h3>
        <table className="table-base">
          <thead>
            <tr>
              <th>Month</th>
              <th>Account</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>2026-01</td>
              <td>Cash</td>
              <td>45,000</td>
              <td></td>
            </tr>
            <tr>
              <td>2026-01</td>
              <td>Jewelry Sales</td>
              <td></td>
              <td>45,000</td>
            </tr>
            <tr>
              <td>2026-02</td>
              <td>Rent</td>
              <td>90,000</td>
              <td></td>
            </tr>
            <tr>
              <td>2026-02</td>
              <td>Cash</td>
              <td></td>
              <td>90,000</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-stone-500">
          &quot;Account&quot; can be the chart-of-accounts code (e.g. &quot;1000&quot;) or the account name — see{" "}
          <Link href="/accounting/chart-of-accounts" className="text-brand-700 hover:underline">
            Chart of Accounts
          </Link>{" "}
          for the full list. If a month&apos;s rows don&apos;t balance on their own (common when the old system only kept
          partial detail), the difference posts to &quot;Historical Data Suspense&quot; for review — it won&apos;t block the
          import.
        </p>
      </div>
    </div>
  );
}
