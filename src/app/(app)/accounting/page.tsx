import Link from "next/link";
import { TrendUp, TrendDown } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canManageAccounting, canManagePayroll, canDeleteOrRequest, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate, round2 } from "@/lib/utils";
import { ExpenseForm } from "@/components/ExpenseForm";
import { AccountingTrendChart } from "@/components/AccountingTrendChart";
import { RankedBarChart } from "@/components/RankedBarChart";
import { setBudget, deleteBudget } from "./actions";
import { PrintButton } from "@/components/PrintButton";
import { ExportButton } from "@/components/ExportButton";
import { ExpenseActions } from "@/components/ExpenseActions";

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
  searchParams: Promise<{ from?: string; to?: string; branchId?: string; brandId?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { from, to, branchId, brandId } = await searchParams;
  const fromDate = from ? new Date(from) : startOfMonth();
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  const scope = branchScope(session, branchId);
  const showPayroll = canManagePayroll(session.roles);
  const selectedBrandId = brandId || undefined;
  const ledgerBrandFilter = selectedBrandId
    ? { OR: [{ sale: { brandId: selectedBrandId } }, { expense: { brandId: selectedBrandId } }] }
    : {};
  const directBrandFilter = selectedBrandId ? { brandId: selectedBrandId } : {};

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    ledger,
    branches,
    brands,
    pendingPayrollCount,
    thisMonthLedger,
    lastMonthLedger,
    trendLedger,
    salesInRange,
    budgets,
    thisMonthExpenses,
  ] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { ...scope, ...ledgerBrandFilter, date: { gte: fromDate, lte: toDate } },
      include: { branch: true, sale: true, expense: true },
      orderBy: { date: "desc" },
    }),
    isCompanyWide(session.roles) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    showPayroll ? db.payrollRun.count({ where: { status: "DRAFT" } }) : Promise.resolve(0),
    db.ledgerEntry.findMany({
      where: { ...scope, ...ledgerBrandFilter, date: { gte: thisMonthStart, lte: now } },
      select: { type: true, amount: true },
    }),
    db.ledgerEntry.findMany({
      where: { ...scope, ...ledgerBrandFilter, date: { gte: lastMonthStart, lte: lastMonthEnd } },
      select: { type: true, amount: true },
    }),
    db.ledgerEntry.findMany({
      where: { ...scope, ...ledgerBrandFilter, date: { gte: trendStart } },
      select: { date: true, type: true, amount: true },
    }),
    db.sale.findMany({
      where: { ...scope, ...directBrandFilter, createdAt: { gte: fromDate, lte: toDate } },
      select: { total: true },
    }),
    db.budget.findMany({ where: scope, orderBy: { category: "asc" } }),
    db.expense.findMany({
      where: { ...scope, ...directBrandFilter, date: { gte: thisMonthStart, lte: now } },
      select: { category: true, amount: true },
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
    isCompanyWide(session.roles) && branches.length > 1
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

  const spentByCategory = new Map<string, number>();
  for (const e of thisMonthExpenses) {
    spentByCategory.set(e.category, (spentByCategory.get(e.category) ?? 0) + e.amount);
  }
  const budgetRows = budgets.map((b) => {
    const spent = round2(spentByCategory.get(b.category) ?? 0);
    return { ...b, spent, overBudget: spent > b.monthlyLimit };
  });
  const overBudgetCount = budgetRows.filter((b) => b.overBudget).length;

  return (
    <div className="space-y-6">
      <h1 className="page-title print:hidden">Accounting</h1>

      <form className="card flex flex-wrap items-end gap-3 print:hidden" action="/accounting">
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
        {brands.length > 0 && (
          <div>
            <label className="label">Brand</label>
            <select className="input" name="brandId" defaultValue={brandId ?? ""}>
              <option value="">All brands</option>
              {brands.map((b) => (
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 print:hidden">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
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

      <div className="card print:hidden">
        <h2 className="mb-3 font-medium">Income, expenses & profit — last 6 months</h2>
        <AccountingTrendChart data={trendData} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:hidden">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:hidden">
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
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Financial statements</h2>
            <p className="text-sm text-stone-500">Profit &amp; Loss and cost-cutting insights. (Balance Sheet and Cash Flow are below.)</p>
          </div>
          <Link href="/accounting/statements" className="btn-primary">
            Open Statements
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Chart of Accounts</h2>
            <p className="text-sm text-stone-500">The accounts every journal entry posts to.</p>
          </div>
          <Link href="/accounting/chart-of-accounts" className="btn-primary">
            Open
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Journal Entries</h2>
            <p className="text-sm text-stone-500">Manual double-entry postings — debits must equal credits.</p>
          </div>
          <Link href="/accounting/journal-entries" className="btn-primary">
            Open
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">General Ledger</h2>
            <p className="text-sm text-stone-500">Every posted journal line — the source of truth for reporting.</p>
          </div>
          <Link href="/accounting/general-ledger" className="btn-primary">
            Open
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Trial Balance</h2>
            <p className="text-sm text-stone-500">Every account&apos;s totals — debits and credits must balance.</p>
          </div>
          <Link href="/accounting/trial-balance" className="btn-primary">
            Open
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Balance Sheet</h2>
            <p className="text-sm text-stone-500">What the business owns, owes, and is worth, as of a date.</p>
          </div>
          <Link href="/accounting/balance-sheet" className="btn-primary">
            Open
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Cash Flow Statement</h2>
            <p className="text-sm text-stone-500">Where cash actually came from and went, over a period.</p>
          </div>
          <Link href="/accounting/cash-flow" className="btn-primary">
            Open
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Accounts Receivable Aging</h2>
            <p className="text-sm text-stone-500">Who owes the business, by customer and how overdue.</p>
          </div>
          <Link href="/accounting/ar-aging" className="btn-primary">
            Open
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Accounts Payable Aging</h2>
            <p className="text-sm text-stone-500">What the business owes suppliers, by how overdue.</p>
          </div>
          <Link href="/accounting/ap-aging" className="btn-primary">
            Open
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Bank Reconciliation</h2>
            <p className="text-sm text-stone-500">Upload a bank statement and match it against the ledger.</p>
          </div>
          <Link href="/accounting/bank-reconciliation" className="btn-primary">
            Open
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Accounting Setup</h2>
            <p className="text-sm text-stone-500">Opening balances and backfilling historic transactions.</p>
          </div>
          <Link href="/accounting/setup" className="btn-primary">
            Open
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Health Check</h2>
            <p className="text-sm text-stone-500">Whether the ledger is internally consistent, right now.</p>
          </div>
          <Link href="/accounting/health-check" className="btn-primary">
            Open
          </Link>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Import Historical Totals</h2>
            <p className="text-sm text-stone-500">Bring in old months from a previous system, one entry per month.</p>
          </div>
          <Link href="/accounting/import-history" className="btn-primary">
            Open
          </Link>
        </div>
      </div>

      <div className="card space-y-4 print:hidden">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Budgets — this month</h2>
          {overBudgetCount > 0 && (
            <span className="badge bg-red-100 text-red-700">
              {overBudgetCount} over budget
            </span>
          )}
        </div>

        {budgetRows.length > 0 && (
          <div className="space-y-2">
            {budgetRows.map((b) => {
              const pct = b.monthlyLimit > 0 ? Math.min(round2((b.spent / b.monthlyLimit) * 100), 999) : 0;
              return (
                <div key={b.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-800">{b.category}</span>
                    <div className="flex items-center gap-2">
                      <span className={b.overBudget ? "text-red-700" : "text-stone-500"}>
                        {formatMoney(b.spent)} / {formatMoney(b.monthlyLimit)}
                      </span>
                      <form action={deleteBudget.bind(null, b.id)}>
                        <button type="submit" className="text-xs text-stone-400 hover:text-red-600">
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={`h-full rounded-full ${b.overBudget ? "bg-red-500" : "bg-brand-500"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {budgetRows.length === 0 && (
          <p className="text-sm text-stone-400">No budgets set yet — add one below to start tracking overspend.</p>
        )}

        <form action={setBudget} className="flex flex-wrap items-end gap-3 border-t border-stone-100 pt-4">
          <div>
            <label className="label">Category</label>
            <input className="input" name="category" required placeholder="Rent, Marketing…" list="expense-categories" />
            <datalist id="expense-categories">
              {Array.from(spentByCategory.keys()).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Monthly limit</label>
            <input className="input max-w-[140px]" name="monthlyLimit" type="number" step="0.01" min="0" required />
          </div>
          {isCompanyWide(session.roles) && (
            <div>
              <label className="label">Branch</label>
              <select className="input" name="branchId" defaultValue={branches[0]?.id ?? ""}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="btn-secondary">
            Set budget
          </button>
        </form>
      </div>

      <div className="card max-w-lg print:hidden">
        <h2 className="mb-3 font-medium">Record an expense</h2>
        <ExpenseForm
          branches={branches}
          showBranchSelect={isCompanyWide(session.roles)}
          defaultBranchId={session.branchId ?? branches[0]?.id ?? ""}
          brands={brands}
          defaultBrandId={selectedBrandId}
        />
      </div>

      <div id="ledger-table" className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium print:hidden">Ledger</h2>
          <div className="flex items-center gap-2 print:hidden">
            <ExportButton
              href={`/api/export/accounting?${new URLSearchParams({
                ...(from ? { from } : {}),
                ...(to ? { to } : {}),
                ...(branchId ? { branchId } : {}),
                ...(brandId ? { brandId } : {}),
              }).toString()}`}
            />
            <PrintButton selector="#ledger-table" label="Print" />
          </div>
        </div>
        <div className="print-report-header">
          <h2 className="font-display text-xl font-semibold">Accounting ledger</h2>
          <p className="text-sm text-stone-500">
            {formatDate(fromDate)} – {formatDate(toDate)} · Printed {formatDate(new Date())} — {ledger.length} entries
          </p>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
              <th>Date</th>
              <th>Branch</th>
              <th>Type</th>
              <th>Description</th>
              <th>Amount</th>
              {canManageAccounting(session.roles) && <th className="print:hidden">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {ledger.map((entry) => (
              <tr key={entry.id} data-print-row>
                <td className="print:hidden">
                  <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label="Include entry in print" />
                </td>
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
                {canManageAccounting(session.roles) && (
                  <td className="print:hidden">
                    {entry.expense && (
                      <ExpenseActions
                        expenseId={entry.expense.id}
                        category={entry.expense.category}
                        description={entry.expense.description}
                        amount={entry.expense.amount}
                        date={entry.expense.date.toISOString()}
                        isOwner={session.role === "OWNER"}
                        canDelete={canDeleteOrRequest(session.roles)}
                        locked={!!entry.expense.purchaseOrderId}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
            {ledger.length === 0 && (
              <tr>
                <td colSpan={canManageAccounting(session.roles) ? 7 : 6} className="py-6 text-center text-stone-400">
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
