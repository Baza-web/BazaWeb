import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canManageSalesTargets, isCompanyWide } from "@/lib/rbac";
import { formatMoney, formatDate } from "@/lib/utils";
import { createSalesTarget, deleteSalesTarget } from "./actions";
import { Target, Trash } from "@/components/icons";

function daysRemaining(periodEnd: Date) {
  const ms = periodEnd.getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export default async function TargetsPage() {
  const session = await requireSessionOrRedirect();
  const manager = canManageSalesTargets(session.role);
  const scope = branchScope(session);

  const [targets, staffOptions, branches] = await Promise.all([
    db.salesTarget.findMany({
      where: manager ? scope : { staffId: session.staffId },
      include: { staff: true, branch: true },
      orderBy: { periodStart: "desc" },
    }),
    manager
      ? db.staff.findMany({
          where: {
            ...(isCompanyWide(session.role) ? {} : { branchId: session.branchId }),
            active: true,
            role: { in: ["SALES", "MANAGER"] },
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    manager && isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  const rows = await Promise.all(
    targets.map(async (t) => {
      const achieved = await db.sale.aggregate({
        where: { staffId: t.staffId, createdAt: { gte: t.periodStart, lte: t.periodEnd } },
        _sum: { total: true },
      });
      const achievedAmount = achieved._sum.total ?? 0;
      const percent = t.targetAmount > 0 ? Math.round((achievedAmount / t.targetAmount) * 100) : 0;
      return { target: t, achievedAmount, percent, remaining: daysRemaining(t.periodEnd) };
    }),
  );

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="page-title">Sales Targets</h1>

      {manager && (
        <div className="card max-w-xl">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Target size={18} className="text-brand-500" aria-hidden="true" />
            Set a target
          </h2>
          <form action={createSalesTarget} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Staff member</label>
                <select className="input" name="staffId" required defaultValue="">
                  <option value="" disabled>
                    Select staff…
                  </option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {isCompanyWide(session.role) ? (
                <div>
                  <label className="label">Branch</label>
                  <select className="input" name="branchId" required defaultValue={session.branchId ?? ""}>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <input type="hidden" name="branchId" value={session.branchId ?? ""} />
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Period start</label>
                <input className="input" name="periodStart" type="date" required />
              </div>
              <div>
                <label className="label">Period end</label>
                <input className="input" name="periodEnd" type="date" required />
              </div>
              <div>
                <label className="label">Target amount</label>
                <input className="input" name="targetAmount" type="number" step="0.01" min="0" required />
              </div>
            </div>
            <button type="submit" className="btn-primary">
              Set target
            </button>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {rows.length === 0 && (
          <p className="card text-sm text-stone-400">No sales targets set yet.</p>
        )}
        {rows.map(({ target, achievedAmount, percent, remaining }) => {
          const barColor = percent >= 100 ? "bg-green-600" : remaining < 0 ? "bg-red-500" : "bg-brand-500";
          return (
            <div key={target.id} className="card">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink-900">
                    {manager ? target.staff.name : "Your target"}
                    {isCompanyWide(session.role) && (
                      <span className="ml-2 text-xs text-stone-400">{target.branch.name}</span>
                    )}
                  </p>
                  <p className="text-xs text-stone-500">
                    {formatDate(target.periodStart)} – {formatDate(target.periodEnd)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {formatMoney(achievedAmount)} <span className="text-stone-400">/ {formatMoney(target.targetAmount)}</span>
                  </p>
                  <p className="text-xs text-stone-500">
                    {remaining >= 0 ? `${remaining} day${remaining === 1 ? "" : "s"} left` : "Period ended"}
                  </p>
                </div>
              </div>

              <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className={`h-full rounded-full ${barColor} transition-all`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-stone-500">
                <span>{percent}% reached</span>
                {percent >= 100 && <span className="badge bg-green-100 text-green-700">Target reached</span>}
                {percent < 100 && remaining < 0 && <span className="badge bg-red-100 text-red-700">Missed</span>}
              </div>

              {manager && (
                <form action={deleteSalesTarget.bind(null, target.id)} className="mt-2 text-right">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-red-600"
                  >
                    <Trash size={12} aria-hidden="true" />
                    Remove
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
