import "server-only";
import { db } from "./db";
import type { SessionPayload } from "./auth";
import { isCompanyWide, branchScope } from "./rbac";
import { round2 } from "./utils";

const CASH_CODES = ["1000", "1010", "1020"]; // Cash, Bank, Petty Cash
const FIXED_ASSET_CODE = "1500";
const EQUITY_CODES = ["3000", "3100", "3200"];

/**
 * ASSET/LIABILITY/EQUITY accounts carry their natural balance as of the
 * date; INCOME/EXPENSE accounts don't get their own lines — their net
 * (profit or loss to date) folds into Equity as "Current Year Earnings",
 * since there's no period-closing step that moves it into Retained
 * Earnings. This is what makes Assets = Liabilities + Equity hold by
 * construction: every posted entry is already balanced, so summing it
 * all the same way can never produce a mismatch.
 */
export async function getBalanceSheet(session: SessionPayload, asOfDate: Date, branchId?: string | null) {
  const accounts = await db.account.findMany({
    include: {
      journalLines: {
        where: {
          journalEntry: {
            date: { lte: asOfDate },
            ...(isCompanyWide(session.role) ? (branchId ? { branchId } : {}) : { branchId: session.branchId }),
          },
        },
      },
    },
    orderBy: { code: "asc" },
  });

  const withBalance = accounts.map((a) => {
    const debit = round2(a.journalLines.reduce((s, l) => s + l.debit, 0));
    const credit = round2(a.journalLines.reduce((s, l) => s + l.credit, 0));
    return { account: a, debit, credit };
  });

  const assetRows = withBalance
    .filter((r) => r.account.type === "ASSET")
    .map((r) => ({ account: r.account, balance: round2(r.debit - r.credit) }))
    .filter((r) => r.balance !== 0);
  const liabilityRows = withBalance
    .filter((r) => r.account.type === "LIABILITY")
    .map((r) => ({ account: r.account, balance: round2(r.credit - r.debit) }))
    .filter((r) => r.balance !== 0);
  const equityRows = withBalance
    .filter((r) => r.account.type === "EQUITY")
    .map((r) => ({ account: r.account, balance: round2(r.credit - r.debit) }))
    .filter((r) => r.balance !== 0);

  const totalIncome = round2(withBalance.filter((r) => r.account.type === "INCOME").reduce((s, r) => s + (r.credit - r.debit), 0));
  const totalExpense = round2(withBalance.filter((r) => r.account.type === "EXPENSE").reduce((s, r) => s + (r.debit - r.credit), 0));
  const currentYearEarnings = round2(totalIncome - totalExpense);

  const totalAssets = round2(assetRows.reduce((s, r) => s + r.balance, 0));
  const totalLiabilities = round2(liabilityRows.reduce((s, r) => s + r.balance, 0));
  const totalEquity = round2(equityRows.reduce((s, r) => s + r.balance, 0) + currentYearEarnings);

  return {
    assetRows,
    liabilityRows,
    equityRows,
    currentYearEarnings,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: totalAssets === round2(totalLiabilities + totalEquity),
  };
}

type CashFlowLine = Awaited<ReturnType<typeof getCashFlow>>["rows"][number];
export type { CashFlowLine };

/**
 * Direct-method cash flow: every journal line posted to a Cash/Bank/Petty
 * Cash account is one real cash movement, classified by what the *other*
 * side of its entry touched — Fixed Assets → Investing, Owner's
 * Capital/Retained/Current Year Earnings → Financing, anything else
 * (sales, expenses, payroll, inventory purchases, AR/AP) → Operating.
 */
export async function getCashFlow(session: SessionPayload, fromDate: Date, toDate: Date, branchId?: string | null) {
  const scope = branchScope(session, branchId);
  const dayBeforeFrom = new Date(fromDate.getTime() - 1);

  const [openingLines, periodLines] = await Promise.all([
    db.journalLine.findMany({
      where: { account: { code: { in: CASH_CODES } }, journalEntry: { date: { lte: dayBeforeFrom }, ...scope } },
    }),
    db.journalLine.findMany({
      where: { account: { code: { in: CASH_CODES } }, journalEntry: { date: { gte: fromDate, lte: toDate }, ...scope } },
      include: { journalEntry: { include: { lines: { include: { account: true } } } } },
      orderBy: [{ journalEntry: { date: "asc" } }],
    }),
  ]);

  const openingCash = round2(openingLines.reduce((s, l) => s + (l.debit - l.credit), 0));

  function classify(line: (typeof periodLines)[number]): "OPERATING" | "INVESTING" | "FINANCING" {
    const otherLines = line.journalEntry.lines.filter((l) => l.id !== line.id);
    if (otherLines.some((l) => l.account.code === FIXED_ASSET_CODE)) return "INVESTING";
    if (otherLines.some((l) => EQUITY_CODES.includes(l.account.code))) return "FINANCING";
    return "OPERATING";
  }

  const buckets = { OPERATING: 0, INVESTING: 0, FINANCING: 0 };
  const rows = periodLines.map((l) => {
    const movement = round2(l.debit - l.credit);
    const category = classify(l);
    buckets[category] = round2(buckets[category] + movement);
    return { line: l, movement, category };
  });

  const netChange = round2(buckets.OPERATING + buckets.INVESTING + buckets.FINANCING);
  const closingCash = round2(openingCash + netChange);

  return { openingCash, buckets, rows, netChange, closingCash };
}

export const AGING_BUCKETS = ["Current (0-30)", "31-60 days", "61-90 days", "Over 90 days"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

function bucketFor(ageDays: number): AgingBucket {
  if (ageDays <= 30) return AGING_BUCKETS[0];
  if (ageDays <= 60) return AGING_BUCKETS[1];
  if (ageDays <= 90) return AGING_BUCKETS[2];
  return AGING_BUCKETS[3];
}

/**
 * Accounts Receivable aging: every Sale that isn't fully paid, grouped by
 * customer (walk-in sales with no customer group under "Walk-in / no
 * customer"), bucketed by days since the sale — the same unpaid-balance
 * data the Reports "Customer dues" tile shows, just organized the way an
 * AR subledger reads: one row per customer, a column per age bucket.
 */
export async function getArAging(session: SessionPayload, asOfDate: Date, branchId?: string | null) {
  const sales = await db.sale.findMany({
    where: {
      paymentStatus: { in: ["UNPAID", "PARTIAL"] },
      createdAt: { lte: asOfDate },
      ...branchScope(session, branchId),
    },
    include: { customer: true },
    orderBy: { createdAt: "asc" },
  });

  type CustomerRow = {
    key: string;
    name: string;
    buckets: Record<AgingBucket, number>;
    total: number;
    invoiceCount: number;
  };
  const byCustomer = new Map<string, CustomerRow>();

  for (const sale of sales) {
    const balance = round2(sale.total - sale.amountPaid);
    if (balance <= 0) continue;
    const ageDays = Math.floor((asOfDate.getTime() - sale.createdAt.getTime()) / 86_400_000);
    const bucket = bucketFor(ageDays);
    const key = sale.customerId ?? "__walkin__";
    const name = sale.customer?.name ?? "Walk-in / no customer";
    const existing = byCustomer.get(key) ?? {
      key,
      name,
      buckets: { "Current (0-30)": 0, "31-60 days": 0, "61-90 days": 0, "Over 90 days": 0 },
      total: 0,
      invoiceCount: 0,
    };
    existing.buckets[bucket] = round2(existing.buckets[bucket] + balance);
    existing.total = round2(existing.total + balance);
    existing.invoiceCount += 1;
    byCustomer.set(key, existing);
  }

  const customerRows = [...byCustomer.values()].sort((a, b) => b.total - a.total);
  const grandTotal = round2(customerRows.reduce((s, r) => s + r.total, 0));
  const bucketTotals = Object.fromEntries(
    AGING_BUCKETS.map((b) => [b, round2(customerRows.reduce((s, r) => s + r.buckets[b], 0))]),
  ) as Record<AgingBucket, number>;

  return { customerRows, grandTotal, bucketTotals };
}

/**
 * Accounts Payable aging: every Purchase Order with an unpaid balance
 * (not cancelled), grouped by supplier, bucketed by days since the order
 * was placed — mirrors getArAging, but for what the business owes.
 */
export async function getApAging(session: SessionPayload, asOfDate: Date, branchId?: string | null) {
  const orders = await db.purchaseOrder.findMany({
    where: {
      status: { not: "CANCELLED" },
      orderDate: { lte: asOfDate },
      ...branchScope(session, branchId),
    },
    include: { supplier: true },
    orderBy: { orderDate: "asc" },
  });

  type SupplierRow = {
    key: string;
    name: string;
    buckets: Record<AgingBucket, number>;
    total: number;
    orderCount: number;
  };
  const bySupplier = new Map<string, SupplierRow>();

  for (const order of orders) {
    const balance = round2(order.totalAmount - order.amountPaid);
    if (balance <= 0) continue;
    const ageDays = Math.floor((asOfDate.getTime() - order.orderDate.getTime()) / 86_400_000);
    const bucket = bucketFor(ageDays);
    const existing = bySupplier.get(order.supplierId) ?? {
      key: order.supplierId,
      name: order.supplier.name,
      buckets: { "Current (0-30)": 0, "31-60 days": 0, "61-90 days": 0, "Over 90 days": 0 },
      total: 0,
      orderCount: 0,
    };
    existing.buckets[bucket] = round2(existing.buckets[bucket] + balance);
    existing.total = round2(existing.total + balance);
    existing.orderCount += 1;
    bySupplier.set(order.supplierId, existing);
  }

  const supplierRows = [...bySupplier.values()].sort((a, b) => b.total - a.total);
  const grandTotal = round2(supplierRows.reduce((s, r) => s + r.total, 0));
  const bucketTotals = Object.fromEntries(
    AGING_BUCKETS.map((b) => [b, round2(supplierRows.reduce((s, r) => s + r.buckets[b], 0))]),
  ) as Record<AgingBucket, number>;

  return { supplierRows, grandTotal, bucketTotals };
}
