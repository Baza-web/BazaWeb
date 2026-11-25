import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";
import { seedDefaultChartOfAccounts, createAccount, toggleAccountActive, deleteAccount } from "./actions";
import { PrintButton } from "@/components/PrintButton";

const TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
const TYPE_LABELS: Record<string, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expenses",
};

export default async function ChartOfAccountsPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const accounts = await db.account.findMany({ orderBy: { code: "asc" } });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">Chart of Accounts</h1>
          <p className="text-sm text-stone-500">The accounts every journal entry posts to — the backbone of the General Ledger.</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton selector="#accounts-table" label="Print" />
          <Link href="/accounting" className="btn-secondary">
            Back to Accounting
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Chart of Accounts</h2>
        <p className="text-sm text-stone-500">Printed {formatDate(new Date())} — {accounts.length} account(s)</p>
      </div>

      {accounts.length === 0 && (
        <div className="card print:hidden">
          <p className="mb-3 text-sm text-stone-600">
            No accounts set up yet. Start with the standard Chart of Accounts (Cash, Bank, Accounts
            Receivable/Payable, Sales, standard expense categories, and more) — you can rename, add to, or
            deactivate any of these afterward.
          </p>
          <form action={seedDefaultChartOfAccounts}>
            <button type="submit" className="btn-primary">
              Set up default accounts
            </button>
          </form>
        </div>
      )}

      <div id="accounts-table" className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th className="print:hidden">Actions</th>
            </tr>
          </thead>
          <tbody>
            {TYPE_ORDER.flatMap((type) => accounts.filter((a) => a.type === type)).map((a) => (
              <tr key={a.id} className={a.active ? undefined : "opacity-60"}>
                <td className="font-mono text-xs">{a.code}</td>
                <td className="font-medium">{a.name}</td>
                <td className="text-xs text-stone-500">{TYPE_LABELS[a.type]}</td>
                <td>
                  <span className={`badge ${a.active ? "bg-green-100 text-green-700" : "bg-stone-200 text-stone-600"}`}>
                    {a.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="print:hidden">
                  <div className="flex items-center gap-3 text-xs">
                    <form action={toggleAccountActive.bind(null, a.id)}>
                      <button type="submit" className="text-brand-700 hover:underline">
                        {a.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                    {!a.isSystem && (
                      <form action={deleteAccount.bind(null, a.id)}>
                        <button type="submit" className="text-red-600 hover:underline">
                          Delete
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-stone-400">
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card max-w-md print:hidden">
        <h2 className="mb-3 font-medium">Add an account</h2>
        <form action={createAccount} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Code</label>
              <input className="input" name="code" placeholder="e.g. 5950" required />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" name="type" required>
                {TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" name="name" required />
          </div>
          <button type="submit" className="btn-primary">
            Add account
          </button>
        </form>
      </div>
    </div>
  );
}
