import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canViewReports, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate, round2 } from "@/lib/utils";
import { Trophy, ChartPieSlice, ClockCountdown, Percent, Truck, Wallet, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { PrintButton } from "@/components/PrintButton";

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; branchId?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canViewReports(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { from, to, branchId } = await searchParams;
  const fromDate = from ? new Date(from) : startOfMonth();
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  const scope = branchScope(session, branchId);

  const [saleItemsInRange, staffLeaderboard, agingItems, branches, openPurchaseOrders, unpaidSales] =
    await Promise.all([
      db.saleItem.findMany({
        where: { sale: { ...scope, createdAt: { gte: fromDate, lte: toDate } } },
        include: { inventoryItem: true },
      }),
      db.sale.groupBy({
        by: ["staffId"],
        where: { ...scope, createdAt: { gte: fromDate, lte: toDate } },
        _sum: { total: true },
        _count: true,
        orderBy: { _sum: { total: "desc" } },
        take: 10,
      }),
      db.inventoryItem.findMany({
        where: { ...scope, status: "IN_STOCK" },
        orderBy: { createdAt: "asc" },
        take: 10,
      }),
      isCompanyWide(session.roles) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
      db.purchaseOrder.findMany({
        where: { ...scope, status: { in: ["ORDERED", "RECEIVED"] } },
        include: { supplier: true },
        orderBy: { expectedDate: "asc" },
      }),
      db.sale.findMany({
        where: { ...scope, paymentStatus: { in: ["PARTIAL", "UNPAID"] } },
        include: { customer: true },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
    ]);

  const poDues = openPurchaseOrders
    .map((po) => ({ ...po, balance: round2(po.totalAmount - po.amountPaid) }))
    .filter((po) => po.balance > 0);
  const totalPODues = poDues.reduce((s, po) => s + po.balance, 0);

  const saleDues = unpaidSales.map((sale) => ({
    ...sale,
    balance: round2(sale.total - sale.amountPaid),
    daysOutstanding: Math.floor((Date.now() - sale.createdAt.getTime()) / 86_400_000),
  }));
  const totalSaleDues = saleDues.reduce((s, sale) => s + sale.balance, 0);

  // Aggregate best-sellers and profit margin in JS — revenue per line is
  // priceEach * quantity, which Prisma's groupBy can't compute directly.
  const byItem = new Map<
    string,
    { name: string; sku: string; quantity: number; revenue: number; cost: number }
  >();
  for (const line of saleItemsInRange) {
    const existing = byItem.get(line.inventoryItemId) ?? {
      name: line.inventoryItem.name,
      sku: line.inventoryItem.sku,
      quantity: 0,
      revenue: 0,
      cost: 0,
    };
    existing.quantity += line.quantity;
    existing.revenue += line.priceEach * line.quantity;
    existing.cost += line.inventoryItem.costPrice * line.quantity;
    byItem.set(line.inventoryItemId, existing);
  }
  const bestSellers = [...byItem.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const totalRevenue = [...byItem.values()].reduce((s, i) => s + i.revenue, 0);
  const totalCost = [...byItem.values()].reduce((s, i) => s + i.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const staffIds = staffLeaderboard.map((s) => s.staffId);
  const staffById = staffIds.length
    ? Object.fromEntries((await db.staff.findMany({ where: { id: { in: staffIds } } })).map((s) => [s.id, s.name]))
    : {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title print:hidden">Reports</h1>
        <PrintButton label="Print report" />
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Reports</h2>
        <p className="text-sm text-stone-500">
          {formatDate(fromDate)} – {formatDate(toDate)} · Printed {formatDate(new Date())}
        </p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 print:hidden" action="/reports">
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
        <button type="submit" className="btn-secondary">
          Apply
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Revenue (range)</p>
            <ChartPieSlice size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-ink-900">{formatMoney(totalRevenue)}</p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Gross profit</p>
            <Percent size={18} className="text-green-600" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-green-700">{formatMoney(totalProfit)}</p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Margin</p>
            <Percent size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-ink-900">{margin.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Owed to suppliers</p>
            <Truck size={18} className="text-red-600" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-red-700">{formatMoney(totalPODues)}</p>
          <p className="mt-1 text-xs text-stone-500">
            {poDues.length} open purchase order{poDues.length === 1 ? "" : "s"} with a balance
          </p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Owed by customers</p>
            <Wallet size={18} className="text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-amber-700">{formatMoney(totalSaleDues)}</p>
          <p className="mt-1 text-xs text-stone-500">
            {saleDues.length} unpaid or partially paid sale{saleDues.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="font-medium">Deep insights</h2>
          <p className="text-sm text-stone-500">Customer segmentation, inventory turnover, and a revenue forecast.</p>
        </div>
        <Link href="/reports/insights" className="btn-primary">
          <MagnifyingGlass size={16} aria-hidden="true" />
          Open Insights
        </Link>
      </div>

      <div id="po-dues-table" className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2">
            <Truck size={18} className="text-brand-500" aria-hidden="true" />
            Purchase orders — open &amp; due
          </h2>
          <PrintButton selector="#po-dues-table" label="Print" />
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
              <th>Order #</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Expected</th>
              <th>Balance due</th>
            </tr>
          </thead>
          <tbody>
            {poDues.map((po) => {
              const overdue = po.status === "ORDERED" && po.expectedDate && po.expectedDate < new Date();
              return (
                <tr key={po.id} data-print-row>
                  <td className="print:hidden">
                    <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include ${po.orderNumber} in print`} />
                  </td>
                  <td>{po.orderNumber}</td>
                  <td>{po.supplier.name}</td>
                  <td>
                    <span className="badge bg-stone-200 text-stone-600">{po.status}</span>
                    {overdue && <span className="badge ml-2 bg-red-100 text-red-700">Overdue</span>}
                  </td>
                  <td>{po.expectedDate ? formatDate(po.expectedDate) : "—"}</td>
                  <td className="font-medium text-red-700">{formatMoney(po.balance)}</td>
                </tr>
              );
            })}
            {poDues.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-stone-400">
                  No purchase order balances outstanding.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div id="customer-dues-table" className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2">
            <Wallet size={18} className="text-brand-500" aria-hidden="true" />
            Customer dues — unpaid &amp; partial sales
          </h2>
          <PrintButton selector="#customer-dues-table" label="Print" />
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Sold</th>
              <th>Days outstanding</th>
              <th>Balance due</th>
            </tr>
          </thead>
          <tbody>
            {saleDues.map((sale) => (
              <tr key={sale.id} data-print-row>
                <td className="print:hidden">
                  <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include invoice ${sale.invoiceNumber} in print`} />
                </td>
                <td>{sale.invoiceNumber}</td>
                <td>{sale.customer?.name ?? "Walk-in customer"}</td>
                <td>{formatDate(sale.createdAt)}</td>
                <td>
                  {sale.daysOutstanding}
                  {sale.daysOutstanding > 30 && <span className="badge ml-2 bg-red-100 text-red-700">30+ days</span>}
                </td>
                <td className="font-medium text-amber-700">{formatMoney(sale.balance)}</td>
              </tr>
            ))}
            {saleDues.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-stone-400">
                  No outstanding customer balances.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Trophy size={18} className="text-brand-500" aria-hidden="true" />
          Best-selling items
        </h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Qty sold</th>
              <th>Revenue</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {bestSellers.map((item) => (
              <tr key={item.sku}>
                <td>{item.sku}</td>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.revenue)}</td>
                <td>{formatMoney(item.revenue - item.cost)}</td>
              </tr>
            ))}
            {bestSellers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-stone-400">
                  No sales in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Trophy size={18} className="text-brand-500" aria-hidden="true" />
          Staff sales leaderboard
        </h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Sales</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {staffLeaderboard.map((s) => (
              <tr key={s.staffId}>
                <td>{staffById[s.staffId] ?? "—"}</td>
                <td>{s._count}</td>
                <td>{formatMoney(s._sum.total ?? 0)}</td>
              </tr>
            ))}
            {staffLeaderboard.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-stone-400">
                  No sales in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <ClockCountdown size={18} className="text-brand-500" aria-hidden="true" />
          Inventory aging — oldest unsold items
        </h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>In stock since</th>
              <th>Days in stock</th>
            </tr>
          </thead>
          <tbody>
            {agingItems.map((item) => {
              const days = Math.floor((Date.now() - item.createdAt.getTime()) / 86_400_000);
              return (
                <tr key={item.id}>
                  <td>{item.sku}</td>
                  <td>{item.name}</td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{days}</td>
                </tr>
              );
            })}
            {agingItems.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-stone-400">
                  No in-stock items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
