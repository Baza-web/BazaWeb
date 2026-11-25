import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { formatMoney, round2, formatDate } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function StatementsPage({
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
  const selectedBrandId = brandId || undefined;
  const directBrandFilter = selectedBrandId ? { brandId: selectedBrandId } : {};
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const [
    branches,
    brands,
    saleItemsInRange,
    expensesInRange,
    allTimeLedger,
    stockItems,
    openPurchaseOrders,
    unpaidSales,
    budgets,
    thisMonthExpensesByCategory,
    lastMonthExpensesByCategory,
  ] = await Promise.all([
    isCompanyWide(session.roles) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.saleItem.findMany({
      where: { sale: { ...scope, ...directBrandFilter, createdAt: { gte: fromDate, lte: toDate } } },
      include: { inventoryItem: true },
    }),
    db.expense.findMany({ where: { ...scope, ...directBrandFilter, date: { gte: fromDate, lte: toDate } } }),
    db.ledgerEntry.findMany({ where: scope, select: { type: true, amount: true } }),
    db.inventoryItem.findMany({
      where: { ...scope, status: { in: ["IN_STOCK", "RESERVED"] } },
      select: { costPrice: true, quantity: true },
    }),
    db.purchaseOrder.findMany({ where: { ...scope, status: { in: ["ORDERED", "RECEIVED"] } } }),
    db.sale.findMany({ where: { ...scope, ...directBrandFilter, paymentStatus: { in: ["PARTIAL", "UNPAID"] } } }),
    db.budget.findMany({ where: scope }),
    db.expense.findMany({ where: { ...scope, ...directBrandFilter, date: { gte: thisMonthStart, lte: now } }, select: { category: true, amount: true } }),
    db.expense.findMany({ where: { ...scope, ...directBrandFilter, date: { gte: lastMonthStart, lte: lastMonthEnd } }, select: { category: true, amount: true } }),
  ]);

  // --- Profit & Loss ---
  const revenue = round2(saleItemsInRange.reduce((s, i) => s + i.priceEach * i.quantity, 0));
  const cogs = round2(saleItemsInRange.reduce((s, i) => s + i.inventoryItem.costPrice * i.quantity, 0));
  const grossProfit = round2(revenue - cogs);
  const grossMargin = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0;

  // Paying a supplier for inventory moves cash into an asset (stock) — it's
  // not a period expense until that stock sells, and COGS above already
  // captures that cost for whatever sold. Counting the purchase payment here
  // too would expense the same inventory twice, so it's excluded from opex
  // and shown separately for transparency instead.
  const inventoryPurchases = round2(
    expensesInRange.filter((e) => e.purchaseOrderId).reduce((s, e) => s + e.amount, 0),
  );
  const opexByCategory = new Map<string, number>();
  for (const e of expensesInRange) {
    if (e.purchaseOrderId) continue;
    opexByCategory.set(e.category, (opexByCategory.get(e.category) ?? 0) + e.amount);
  }
  const opexRows = Array.from(opexByCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount: round2(amount) }));
  const totalOpex = round2(opexRows.reduce((s, r) => s + r.amount, 0));
  const netIncome = round2(grossProfit - totalOpex);

  // --- Balance sheet (snapshot as of now) ---
  const cash = round2(
    allTimeLedger.reduce((s, l) => s + (l.type === "INCOME" ? l.amount : -l.amount), 0),
  );
  const inventoryValue = round2(stockItems.reduce((s, i) => s + i.costPrice * i.quantity, 0));
  const accountsReceivable = round2(unpaidSales.reduce((s, sale) => s + (sale.total - sale.amountPaid), 0));
  const accountsPayable = round2(
    openPurchaseOrders.reduce((s, po) => s + Math.max(po.totalAmount - po.amountPaid, 0), 0),
  );
  const totalAssets = round2(cash + inventoryValue + accountsReceivable);
  const totalLiabilities = accountsPayable;
  const equity = round2(totalAssets - totalLiabilities);

  // --- Cost-cutting insights ---
  const insights: string[] = [];
  if (opexRows.length > 0) {
    const top = opexRows[0];
    const share = totalOpex > 0 ? round2((top.amount / totalOpex) * 100) : 0;
    insights.push(`"${top.category}" is your biggest operating expense — ${formatMoney(top.amount)}, ${share}% of total spend in this range.`);
  }
  const thisMonthByCategory = new Map<string, number>();
  for (const e of thisMonthExpensesByCategory) thisMonthByCategory.set(e.category, (thisMonthByCategory.get(e.category) ?? 0) + e.amount);
  const lastMonthByCategory = new Map<string, number>();
  for (const e of lastMonthExpensesByCategory) lastMonthByCategory.set(e.category, (lastMonthByCategory.get(e.category) ?? 0) + e.amount);
  for (const [category, thisAmt] of thisMonthByCategory) {
    const lastAmt = lastMonthByCategory.get(category) ?? 0;
    if (lastAmt > 0 && thisAmt > lastAmt * 1.2) {
      const growth = round2(((thisAmt - lastAmt) / lastAmt) * 100);
      insights.push(`"${category}" spend is up ${growth}% this month vs last (${formatMoney(lastAmt)} → ${formatMoney(thisAmt)}) — worth a closer look.`);
    }
  }
  const overBudget = budgets.filter((b) => (thisMonthByCategory.get(b.category) ?? 0) > b.monthlyLimit);
  for (const b of overBudget) {
    insights.push(`"${b.category}" is over its ${formatMoney(b.monthlyLimit)} monthly budget (spent ${formatMoney(thisMonthByCategory.get(b.category) ?? 0)} so far).`);
  }
  if (revenue > 0) {
    const cogsRatio = round2((cogs / revenue) * 100);
    insights.push(`Cost of goods sold is ${cogsRatio}% of revenue in this range — a lower ratio means more margin per sale.`);
  }
  if (accountsReceivable > 0) {
    insights.push(`${formatMoney(accountsReceivable)} is still owed by customers — collecting it would directly boost cash on hand.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">Financial statements</h1>
          <p className="text-sm text-stone-500">Profit &amp; Loss, Balance Sheet, and where to cut cost.</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton label="Print statements" />
          <Link href="/accounting" className="btn-secondary">
            Back to Accounting
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Financial statements</h2>
        <p className="text-sm text-stone-500">
          {formatDate(fromDate)} – {formatDate(toDate)} · Printed {formatDate(new Date())}
        </p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 print:hidden" action="/accounting/statements">
        <div>
          <label className="label">From</label>
          <input className="input" type="date" name="from" defaultValue={fromDate.toISOString().slice(0, 10)} />
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

      <div className="card max-w-xl">
        <h2 className="mb-4 font-medium">Profit &amp; Loss statement</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt>Revenue</dt>
            <dd className="font-medium">{formatMoney(revenue)}</dd>
          </div>
          <div className="flex justify-between text-stone-500">
            <dt>Cost of goods sold</dt>
            <dd>-{formatMoney(cogs)}</dd>
          </div>
          <div className="flex justify-between border-t border-stone-100 pt-2 font-medium">
            <dt>Gross profit</dt>
            <dd>
              {formatMoney(grossProfit)} <span className="text-xs text-stone-400">({grossMargin}%)</span>
            </dd>
          </div>
          <div className="pt-2">
            <p className="mb-1 text-stone-500">Operating expenses</p>
            {opexRows.map((r) => (
              <div key={r.category} className="flex justify-between pl-3 text-stone-500">
                <dt>{r.category}</dt>
                <dd>-{formatMoney(r.amount)}</dd>
              </div>
            ))}
            {opexRows.length === 0 && <p className="pl-3 text-stone-400">No expenses in this range.</p>}
          </div>
          <div className="flex justify-between border-t border-stone-100 pt-2 text-stone-500">
            <dt>Total operating expenses</dt>
            <dd>-{formatMoney(totalOpex)}</dd>
          </div>
          <div className="flex justify-between border-t-2 border-stone-200 pt-2 text-base font-semibold">
            <dt>Net income</dt>
            <dd className={netIncome >= 0 ? "text-green-700" : "text-red-700"}>{formatMoney(netIncome)}</dd>
          </div>
          {inventoryPurchases > 0 && (
            <p className="border-t border-stone-100 pt-2 text-xs text-stone-400">
              Not counted above: {formatMoney(inventoryPurchases)} paid to suppliers for new stock this range — that&apos;s
              cash moving into inventory (an asset), not an expense. It becomes cost of goods sold once it sells.
            </p>
          )}
        </dl>
      </div>

      <div className="card max-w-xl">
        <h2 className="mb-1 font-medium">Balance sheet</h2>
        <p className="mb-4 text-xs text-stone-400">
          Snapshot as of today — not limited to the date range above. Cash, inventory, and accounts payable are
          whole-business figures regardless of the brand filter (they aren&apos;t tracked per brand); accounts
          receivable does respect it.
        </p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-stone-600">Assets</p>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt>Cash on hand</dt>
                <dd>{formatMoney(cash)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Inventory (at cost)</dt>
                <dd>{formatMoney(inventoryValue)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Accounts receivable</dt>
                <dd>{formatMoney(accountsReceivable)}</dd>
              </div>
              <div className="flex justify-between border-t border-stone-100 pt-1.5 font-medium">
                <dt>Total assets</dt>
                <dd>{formatMoney(totalAssets)}</dd>
              </div>
            </dl>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-stone-600">Liabilities &amp; equity</p>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt>Accounts payable</dt>
                <dd>{formatMoney(totalLiabilities)}</dd>
              </div>
              <div className="flex justify-between border-t border-stone-100 pt-1.5 font-medium">
                <dt>Owner&apos;s equity</dt>
                <dd>{formatMoney(equity)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="card max-w-xl">
        <h2 className="mb-3 font-medium">Where to cut cost</h2>
        {insights.length > 0 ? (
          <ul className="list-disc space-y-2 pl-5 text-sm text-stone-700">
            {insights.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-400">Not enough activity yet to surface insights.</p>
        )}
      </div>
    </div>
  );
}
