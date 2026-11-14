import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate } from "@/lib/utils";
import { ExpenseForm } from "@/components/ExpenseForm";

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; branchId?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { from, to, branchId } = await searchParams;
  const fromDate = from ? new Date(from) : startOfMonth();
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  const scope = branchScope(session, branchId);

  const [ledger, branches] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { ...scope, date: { gte: fromDate, lte: toDate } },
      include: { branch: true, sale: true, expense: true },
      orderBy: { date: "desc" },
    }),
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  const income = ledger.filter((l) => l.type === "INCOME").reduce((s, l) => s + l.amount, 0);
  const expenseTotal = ledger.filter((l) => l.type === "EXPENSE").reduce((s, l) => s + l.amount, 0);
  const profit = income - expenseTotal;

  return (
    <div className="space-y-6">
      <h1 className="page-title">Accounting</h1>

      <form className="card flex flex-wrap items-end gap-3" action="/accounting">
        <div>
          <label className="label">From</label>
          <input
            className="input"
            type="date"
            name="from"
            defaultValue={fromDate.toISOString().slice(0, 10)}
          />
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs text-stone-500">Income</p>
          <p className="text-xl font-semibold text-green-700">{formatMoney(income)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Expenses</p>
          <p className="text-xl font-semibold text-red-700">{formatMoney(expenseTotal)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Net profit</p>
          <p className={`text-xl font-semibold ${profit >= 0 ? "text-green-700" : "text-red-700"}`}>
            {formatMoney(profit)}
          </p>
        </div>
      </div>

      <div className="card max-w-lg">
        <h2 className="mb-3 font-medium">Record an expense</h2>
        <ExpenseForm
          branches={branches}
          showBranchSelect={isCompanyWide(session.role)}
          defaultBranchId={session.branchId ?? branches[0]?.id ?? ""}
        />
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-medium">Ledger</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Date</th>
              <th>Branch</th>
              <th>Type</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDate(entry.date)}</td>
                <td>{entry.branch.name}</td>
                <td>
                  <span
                    className={`badge ${
                      entry.type === "INCOME" ? "bg-green-100 text-green-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {entry.type}
                  </span>
                </td>
                <td>
                  {entry.description}
                  {entry.expense?.receiptImage && (
                    <a
                      href={entry.expense.receiptImage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-brand-700 hover:underline"
                    >
                      Receipt
                    </a>
                  )}
                </td>
                <td className={entry.type === "INCOME" ? "text-green-700" : "text-red-700"}>
                  {entry.type === "INCOME" ? "+" : "-"}
                  {formatMoney(entry.amount)}
                </td>
              </tr>
            ))}
            {ledger.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-stone-400">
                  No activity in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
