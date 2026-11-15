import Link from "next/link";
import { TrendUp, TrendDown } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canManageAccounting, canManagePayroll, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate, round2 } from "@/lib/utils";
import { ExpenseForm } from "@/components/ExpenseForm";
import { AccountingTrendChart } from "@/components/AccountingTrendChart";
import { RankedBarChart } from "@/components/RankedBarChart";

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sumByType(entries: { type: string; amount: number }[], type: "INCOME" | "EXPENSE") {
  return entries.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round2(((current - previous) / previous) * 100);
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function TrendBadge({ change, invertColors = false }: { change: number; invertColors?: boolean }) {
  const isUp = change >= 0;
  const good = invertColors ? !isUp : isUp;
  const Icon = isUp ? TrendUp : TrendDown;
  return (
    <p className={`flex items-center gap-1 text-xl font-semibold ${good ? "text-green-700" : "text-red-700"}`}>
      <Icon size={18} aria-hidden="true" />
      {Math.abs(change).toFixed(1)}%
    </p>
  );
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
  const showPayroll = canManagePayroll(session.role);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [ledger, branches, pendingPayrollCount, thisMonthLedger, lastMonthLedger, trendLedger, salesInRange] =
    await Promise.all([
      db.ledgerEntry.findMany({
        where: { ...scope, date: { gte: fromDate, lte: toDate } },
        include: { branch: true, sale: true, expense: true },
        orderBy: { date: "desc" },
      }),
      isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
      showPayroll ? db.payrollRun.count({ where: { status: "DRAFT" } }) : Promise.resolve(0),
      db.ledgerEntry.findMany({
        where: { ...scope, date: { gte: thisMonthStart, lte: now } },
        select: { type: true, amount: true },
      }),
      db.ledgerEntry.findMany({
        where: { ...scope, date: { gte: lastMonthStart, lte: lastMonthEnd } },
        select: { type: true, amount: true },
      }),
      db.ledgerEntry.findMany({
        where: { ...scope, date: { gte: trendStart } },
        select: { date: true, type: true, amount: true },
      }),
      db.sale.findMany({
        where: { ...scope, createdAt: { gte: fromDate, lte: toDate } },
        select: { total: true },
      }),
    ]);

  const income = ledger.filter((l) => l.type === "INCOME").reduce((s, l) => s + l.amount, 0);
  const expenseTotal = ledger.filter((l) => l.type === "EXPENSE").reduce((s, l) => s + l.amount, 0);
  const profit = income - expenseTotal;
  const profitMargin = income > 0 ? round2((profit / income) * 100) : 0;

  const thisMonthIncome = sumByType(thisMonthLedger, "INCOME");
  const thisMonthExpense = sumByType(thisMonthLedger, "EXPENSE");
  const lastMonthIncome = sumByType(lastMonthLedger, "INCOME");
  const lastMonthExpense = sumByType(lastMonthLedger, "EXPENSE");
  const incomeChange = pctChange(thisMonthIncome, lastMonthIncome);
  const expenseChange = pctChange(thisMonthExpense, lastMonthExpense);
  const profitChange = pctChange(thisMonthIncome - thisMonthExpense, lastMonthIncome - lastMonthExpense);

  const trendBuckets = new Map<string, { income: number; expense: number }>();
  for (let i = 0; i < 6; i++) {
    const d = new Date(trendStart.getFullYear(), trendStart.getMonth() + i, 1);
    trendBuckets.set(monthKey(d), { income: 0, expense: 0 });
  }
  for (const entry of trendLedger) {
    const bucket = trendBuckets.get(monthKey(entry.date));
    if (!bucket) continue;
    if (entry.type === "INCOME") bucket.income += entry.amount;
    else bucket.expense += entry.amount;
  }
  const trendData = Array.from(trendBuckets.entries()).map(([month, v]) => ({
    month,
    income: round2(v.income),
    expense: round2(v.expense),
    profit: round2(v.income - v.expense),
  }));

  const expenseByCategory = new Map<string, number>();
  for (const entry of ledger) {
    if (entry.type === "EXPENSE") {
      const category = entry.expense?.category ?? "Other";
      expenseByCategory.set(category, (expenseByCategory.get(category) ?? 0) + entry.amount);
    }
  }
  const categoryData = Array.from(expenseByCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value: round2(value) }));

  const branchProfitData =
    isCompanyWide(session.role) && branches.length > 1
      ? Array.from(
          ledger
            .reduce((map, entry) => {
              const existing = map.get(entry.branch.name) ?? 0;
              map.set(entry.branch.name, existing + (entry.type === "INCOME" ? entry.amount : -entry.amount));
              return map;
            }, new Map<string, number>())
            .entries(),
        )
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value: round2(value) }))
      : [];

  const salesCount = salesInRange.length;
  const avgSaleValue = salesCount > 0 ? round2(salesInRange.reduce((s, x) => s + x.total, 0) / salesCount) : 0;

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-xs text-stone-500">Profit margin</p>
          <p className="text-xl font-semibold text-ink-900">{profitMargin.toFixed(1)}%</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Sales this range</p>
          <p className="text-xl font-semibold text-ink-900">{salesCount}</p>
          <p className="text-xs text-stone-500">avg {formatMoney(avgSaleValue)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Income vs last month</p>
          <TrendBadge change={incomeChange} />
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Profit vs last month</p>
          <TrendBadge change={profitChange} />
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Income, expenses & profit — last 6 months</h2>
        <AccountingTrendChart data={trendData} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-medium">Expenses by category</h2>
          <RankedBarChart data={categoryData} />
        </div>
        {branchProfitData.length > 0 ? (
          <div className="card">
            <h2 className="mb-3 font-medium">Profit by branch</h2>
            <RankedBarChart data={branchProfitData} />
          </div>
        ) : (
          <div className="card">
            <h2 className="mb-3 font-medium">Expense change vs last month</h2>
            <TrendBadge change={expenseChange} invertColors />
            <p className="mt-2 text-sm text-stone-500">
              {formatMoney(lastMonthExpense)} last month → {formatMoney(thisMonthExpense)} this month so far.
            </p>
          </div>
        )}
      </div>

      {showPayroll && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Payroll</h2>
            <p className="text-sm text-stone-500">
              {pendingPayrollCount > 0
                ? `${pendingPayrollCount} draft run${pendingPayrollCount === 1 ? "" : "s"} waiting to be reviewed and paid.`
                : "Generated from attendance and approved leave."}
            </p>
          </div>
          <Link href="/accounting/payroll" className="btn-primary">
            Open Payroll
          </Link>
        </div>
      )}

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
