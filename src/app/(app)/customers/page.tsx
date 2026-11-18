import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, isCompanyWide, canManageRewardProgram } from "@/lib/rbac";
import { createCustomer, setRewardRateAction } from "./actions";
import { PrintButton } from "@/components/PrintButton";
import { ExportButton } from "@/components/ExportButton";
import { EnvelopeSimple, Gift } from "@/components/icons";
import { formatDate, formatMoney } from "@/lib/utils";
import { computeRfmStats, classifyRfmSegment, RFM_SEGMENT_LABELS, type RfmSegment } from "@/lib/rfm";
import { getRewardSettings } from "@/lib/rewards";
import type { CustomerStage } from "@prisma/client";

const STAGE_LABELS: Record<CustomerStage, string> = { LEAD: "Lead", PROSPECT: "Prospect", CUSTOMER: "Customer" };
const STAGE_BADGE_CLASS: Record<CustomerStage, string> = {
  LEAD: "bg-amber-50 text-amber-700",
  PROSPECT: "bg-sky-50 text-sky-700",
  CUSTOMER: "bg-green-50 text-green-700",
};
const SEGMENT_BADGE_CLASS: Record<RfmSegment, string> = {
  CHAMPION: "bg-green-50 text-green-700",
  AT_RISK: "bg-amber-50 text-amber-700",
  LOST: "bg-stone-100 text-stone-500",
  NEW: "bg-sky-50 text-sky-700",
  NONE: "bg-stone-100 text-stone-400",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; segment?: string; stage?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const { q, tag, segment: segmentFilter, stage } = await searchParams;

  const canManageRewards = canManageRewardProgram(session.role);
  const [allForTags, branches, rewardSettings] = await Promise.all([
    db.customer.findMany({ where: branchScope(session), select: { tags: true } }),
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    canManageRewards ? getRewardSettings() : Promise.resolve(null),
  ]);
  const allTags = Array.from(new Set(allForTags.flatMap((c) => c.tags))).sort();

  const rawCustomers = await db.customer.findMany({
    where: {
      ...branchScope(session),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(tag ? { tags: { has: tag } } : {}),
      ...(stage ? { stage: stage as CustomerStage } : {}),
    },
    include: { _count: { select: { sales: true } }, sales: { select: { total: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  let customers = rawCustomers.map((c) => ({ ...c, segment: classifyRfmSegment(computeRfmStats(c.sales)) }));
  if (segmentFilter) customers = customers.filter((c) => c.segment === segmentFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Customers</h1>
        <div className="flex items-center gap-2 print:hidden">
          <ExportButton href={`/api/export/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`} />
          <PrintButton selector="#customers-table" />
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Customer list</h2>
        <p className="text-sm text-stone-500">
          {q ? `Filtered by "${q}" — ` : ""}Printed {formatDate(new Date())} — {customers.length} customer(s)
        </p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 print:hidden" action="/customers">
        <div>
          <label className="label">Search</label>
          <input className="input max-w-xs" name="q" placeholder="Name, phone, email…" defaultValue={q} />
        </div>
        <div>
          <label className="label">Tag</label>
          <select className="input max-w-[160px]" name="tag" defaultValue={tag ?? ""}>
            <option value="">Any tag</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Segment</label>
          <select className="input max-w-[160px]" name="segment" defaultValue={segmentFilter ?? ""}>
            <option value="">Any segment</option>
            {(Object.keys(RFM_SEGMENT_LABELS) as RfmSegment[])
              .filter((s) => s !== "NONE")
              .map((s) => (
                <option key={s} value={s}>
                  {RFM_SEGMENT_LABELS[s]}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label">Stage</label>
          <select className="input max-w-[140px]" name="stage" defaultValue={stage ?? ""}>
            <option value="">Any stage</option>
            {(["LEAD", "PROSPECT", "CUSTOMER"] as const).map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
      </form>

      <div id="customers-table" className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Purchases</th>
              <th>Stage</th>
              <th>Segment</th>
              <th>Tags</th>
              <th>Rewards</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} data-print-row>
                <td className="print:hidden">
                  <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include ${c.name} in print`} />
                </td>
                <td>
                  <Link href={`/customers/${c.id}`} className="text-brand-700 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td>{c.phone ?? "—"}</td>
                <td>
                  {c.email ? (
                    <span className="inline-flex items-center gap-1.5">
                      {c.email}
                      <Link
                        href={`/email?customerId=${c.id}`}
                        className="text-stone-400 hover:text-brand-600 print:hidden"
                        title={`Email ${c.name}`}
                      >
                        <EnvelopeSimple size={16} aria-hidden="true" />
                        <span className="sr-only">Email {c.name}</span>
                      </Link>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{c._count.sales}</td>
                <td>
                  <span className={`badge ${STAGE_BADGE_CLASS[c.stage]}`}>{STAGE_LABELS[c.stage]}</span>
                </td>
                <td>
                  <span className={`badge ${SEGMENT_BADGE_CLASS[c.segment]}`}>{RFM_SEGMENT_LABELS[c.segment]}</span>
                </td>
                <td className="max-w-[160px] truncate text-xs text-stone-500">{c.tags.join(", ") || "—"}</td>
                <td className="text-amber-700">{c.rewardBalance > 0 ? formatMoney(c.rewardBalance) : "—"}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-stone-400">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canManageRewards && rewardSettings && (
        <div className="card max-w-lg print:hidden">
          <div className="mb-1 flex items-center gap-2">
            <Gift size={18} className="text-amber-500" aria-hidden="true" />
            <h2 className="font-medium">Reward program</h2>
          </div>
          <p className="mb-3 text-sm text-stone-500">
            Customers earn this automatically on every purchase — e.g. {formatMoney(rewardSettings.rewardPer100k)} per
            100,000 spent works out to {formatMoney(rewardSettings.rewardPer100k)} back on a 100,000 sale.
          </p>
          <form action={setRewardRateAction} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Reward per 100,000 spent</label>
              <input
                className="input max-w-[160px]"
                name="rewardPer100k"
                type="number"
                min="0"
                step="1"
                defaultValue={rewardSettings.rewardPer100k}
                required
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-stone-600">
              <input type="checkbox" name="active" defaultChecked={rewardSettings.active} />
              Program active
            </label>
            <button type="submit" className="btn-secondary">
              Save
            </button>
          </form>
        </div>
      )}

      <div className="card max-w-lg print:hidden">
        <h2 className="mb-3 font-medium">Add a customer</h2>
        <form action={createCustomer} className="space-y-3">
          {isCompanyWide(session.role) && (
            <div>
              <label className="label">Branch</label>
              <select className="input" name="branchId" required>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!isCompanyWide(session.role) && <input type="hidden" name="branchId" value={session.branchId ?? ""} />}
          <div>
            <label className="label">Name</label>
            <input className="input" name="name" required />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Phone</label>
              <input className="input" name="phone" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" name="email" type="email" />
            </div>
            <div>
              <label className="label">Birthday</label>
              <input className="input" name="birthday" type="date" />
            </div>
            <div>
              <label className="label">Anniversary</label>
              <input className="input" name="anniversary" type="date" />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" name="address" />
          </div>
          <button type="submit" className="btn-primary">
            Add customer
          </button>
        </form>
      </div>
    </div>
  );
}
