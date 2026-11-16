import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManagePayroll } from "@/lib/rbac";
import { formatMoney, formatDate } from "@/lib/utils";
import { generatePayrollRun, bulkGeneratePayroll, markPayrollPaid, deletePayrollRun, updatePayrollAdjustment } from "./actions";
import { PrintButton } from "@/components/PrintButton";

function defaultPeriod() {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { periodStart, periodEnd };
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ periodStart?: string; periodEnd?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canManagePayroll(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { periodStart: psRaw, periodEnd: peRaw } = await searchParams;
  const defaults = defaultPeriod();
  const periodStart = psRaw ? new Date(psRaw) : defaults.periodStart;
  const periodEnd = peRaw ? new Date(peRaw) : defaults.periodEnd;
  periodEnd.setHours(23, 59, 59, 999);

  const runs = await db.payrollRun.findMany({
    where: { periodStart, periodEnd },
    include: { staff: { include: { brands: true } }, branch: true },
    orderBy: { staff: { name: "asc" } },
  });

  const eligibleStaff = await db.staff.findMany({
    where: {
      active: true,
      deletedAt: null,
      baseSalary: { not: null },
      branchId: { not: null },
      id: { notIn: runs.map((r) => r.staffId) },
    },
    orderBy: { name: "asc" },
  });

  const totalDraft = runs.filter((r) => r.status === "DRAFT").reduce((s, r) => s + r.netPay, 0);
  const totalPaid = runs.filter((r) => r.status === "PAID").reduce((s, r) => s + r.netPay, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="text-sm text-stone-500">
            Pulled from attendance and approved leave for the period — review, adjust, then mark paid.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton selector="#payroll-table" label="Print" />
          <Link href="/accounting" className="btn-secondary">
            Back to Accounting
          </Link>
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Payroll — {formatDate(periodStart)} – {formatDate(periodEnd)}</h2>
        <p className="text-sm text-stone-500">Printed {formatDate(new Date())} — {runs.length} run(s)</p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 print:hidden" action="/accounting/payroll">
        <div>
          <label className="label">Period start</label>
          <input
            className="input"
            type="date"
            name="periodStart"
            defaultValue={periodStart.toISOString().slice(0, 10)}
          />
        </div>
        <div>
          <label className="label">Period end</label>
          <input className="input" type="date" name="periodEnd" defaultValue={periodEnd.toISOString().slice(0, 10)} />
        </div>
        <button type="submit" className="btn-secondary">
          View period
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs text-stone-500">Draft (unpaid)</p>
          <p className="text-xl font-semibold text-amber-700">{formatMoney(totalDraft)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Paid this period</p>
          <p className="text-xl font-semibold text-green-700">{formatMoney(totalPaid)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-stone-500">Staff awaiting generation</p>
          <p className="text-xl font-semibold text-ink-900">{eligibleStaff.length}</p>
        </div>
      </div>

      {eligibleStaff.length > 0 && (
        <div className="card space-y-3 print:hidden">
          <h2 className="font-medium">Generate payroll for this period</h2>
          <form action={bulkGeneratePayroll}>
            <input type="hidden" name="periodStart" value={periodStart.toISOString()} />
            <input type="hidden" name="periodEnd" value={periodEnd.toISOString()} />
            <button type="submit" className="btn-primary text-sm">
              Generate for all {eligibleStaff.length} eligible staff
            </button>
          </form>
          <p className="text-xs text-stone-500">
            Only active staff with a base salary set on their HR profile are eligible. Or generate one at a time:
          </p>
          <div className="flex flex-wrap gap-2">
            {eligibleStaff.map((s) => (
              <form key={s.id} action={generatePayrollRun.bind(null, s.id)}>
                <input type="hidden" name="periodStart" value={periodStart.toISOString()} />
                <input type="hidden" name="periodEnd" value={periodEnd.toISOString()} />
                <button type="submit" className="btn-secondary text-xs">
                  + {s.name}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <div id="payroll-table" className="card overflow-x-auto">
        <h2 className="mb-3 font-medium">
          {formatDate(periodStart)} – {formatDate(periodEnd)}
        </h2>
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
              <th>Staff</th>
              <th>Branch</th>
              <th>Brands</th>
              <th>Base</th>
              <th>Present</th>
              <th>Leave</th>
              <th>Adjustment</th>
              <th>Net pay</th>
              <th>Status</th>
              <th className="print:hidden">Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} data-print-row>
                <td className="print:hidden">
                  <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include ${run.staff.name} in print`} />
                </td>
                <td>
                  <Link href={`/staff/${run.staffId}`} className="text-brand-700 hover:underline">
                    {run.staff.name}
                  </Link>
                </td>
                <td>{run.branch.name}</td>
                <td className="text-xs text-stone-500">
                  {run.staff.brands.length > 0 ? run.staff.brands.map((b) => b.name).join(", ") : "—"}
                </td>
                <td>{formatMoney(run.baseSalary)}</td>
                <td>{run.daysPresent}</td>
                <td>{run.leaveDaysTaken}</td>
                <td>
                  {run.status === "DRAFT" ? (
                    <>
                      <form action={updatePayrollAdjustment.bind(null, run.id)} className="flex items-center gap-1 print:hidden">
                        <input
                          name="adjustment"
                          type="number"
                          step="0.01"
                          defaultValue={run.adjustment}
                          className="input w-20 text-xs"
                          title="Bonus (positive) or deduction (negative)"
                        />
                        <button type="submit" className="btn-secondary text-xs">
                          Save
                        </button>
                      </form>
                      <span className="hidden print:inline">{formatMoney(run.adjustment)}</span>
                    </>
                  ) : (
                    <span>{formatMoney(run.adjustment)}</span>
                  )}
                </td>
                <td className="font-medium">{formatMoney(run.netPay)}</td>
                <td>
                  <span
                    className={`badge ${
                      run.status === "PAID" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {run.status}
                  </span>
                </td>
                <td className="print:hidden">
                  {run.status === "DRAFT" ? (
                    <div className="flex items-center gap-3">
                      <form action={markPayrollPaid.bind(null, run.id)}>
                        <button type="submit" className="btn-primary text-xs">
                          Mark paid
                        </button>
                      </form>
                      <form action={deletePayrollRun.bind(null, run.id)}>
                        <button type="submit" className="text-xs text-red-600 hover:underline">
                          Delete
                        </button>
                      </form>
                    </div>
                  ) : (
                    run.paidAt && <span className="text-xs text-stone-500">Paid {formatDate(run.paidAt)}</span>
                  )}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={11} className="py-6 text-center text-stone-400">
                  No payroll runs for this period yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
