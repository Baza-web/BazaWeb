import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canManageBrokers, isCompanyWide } from "@/lib/rbac";
import { formatMoney, initials, formatDate } from "@/lib/utils";
import { emailConfigured } from "@/lib/email";
import { MemoForm } from "@/components/MemoForm";
import { createBroker } from "./actions";
import { Handshake, WarningCircle } from "@/components/icons";
import { PrintButton } from "@/components/PrintButton";

export default async function BrokersPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageBrokers(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const scope = branchScope(session);

  const [brokers, inventory, branches] = await Promise.all([
    db.broker.findMany({
      where: scope,
      include: { memos: { include: { items: true } } },
      orderBy: { name: "asc" },
    }),
    db.inventoryItem.findMany({
      where: { ...scope, status: "IN_STOCK", quantity: { gt: 0 } },
      orderBy: { name: "asc" },
    }),
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  const brokerStats = brokers.map((broker) => {
    let outstandingCount = 0;
    let outstandingValue = 0;
    for (const memo of broker.memos) {
      for (const item of memo.items) {
        const out = item.quantity - item.returnedQuantity;
        outstandingCount += out;
        outstandingValue += out * item.valueEach;
      }
    }
    return { broker, outstandingCount, outstandingValue };
  });

  return (
    <div className="space-y-6">
      <h1 className="page-title print:hidden">Brokers &amp; Memos</h1>

      {!emailConfigured() && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            Email isn&apos;t configured yet, so brokers won&apos;t automatically receive their statement by
            email. Memos still work — set <code className="font-mono">RESEND_API_KEY</code> in your
            deployment&apos;s environment variables to enable it.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 print:hidden">
        <div className="card">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Handshake size={18} className="text-brand-500" aria-hidden="true" />
            Issue a memo
          </h2>
          <MemoForm
            inventory={inventory.map((i) => ({
              id: i.id,
              sku: i.sku,
              name: i.name,
              sellingPrice: i.sellingPrice,
              quantity: i.quantity,
            }))}
            brokers={brokers.map((b) => ({ id: b.id, name: b.name }))}
            branches={branches}
            showBranchSelect={isCompanyWide(session.role)}
            defaultBranchId={session.branchId ?? branches[0]?.id ?? ""}
          />
        </div>

        <div className="card">
          <h2 className="section-title mb-3">Add broker</h2>
          <form action={createBroker} className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input className="input" name="name" required />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Company (optional)</label>
                <input className="input" name="company" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" name="phone" />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" name="email" type="email" placeholder="For their memo statements" />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" name="address" />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input" name="notes" rows={2} />
            </div>
            {isCompanyWide(session.role) && (
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
            )}
            <button type="submit" className="btn-secondary">
              Save broker
            </button>
          </form>
        </div>
      </div>

      <div id="brokers-table" className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title print:hidden">All brokers</h2>
          <PrintButton selector="#brokers-table" label="Print" />
        </div>
        <div className="print-report-header">
          <h2 className="font-display text-xl font-semibold">Brokers &amp; memos</h2>
          <p className="text-sm text-stone-500">Printed {formatDate(new Date())} — {brokerStats.length} broker(s)</p>
        </div>
        {brokerStats.length === 0 ? (
          <p className="text-sm text-stone-400">No brokers yet — add one above.</p>
        ) : (
          <>
            <ul className="divide-y divide-stone-100 print:hidden">
              {brokerStats.map(({ broker, outstandingCount, outstandingValue }) => (
                <li key={broker.id}>
                  <Link
                    href={`/brokers/${broker.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-stone-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="avatar h-10 w-10">{initials(broker.name)}</span>
                      <div>
                        <p className="font-medium text-ink-900">{broker.name}</p>
                        <p className="text-xs text-stone-500">
                          {[broker.company, broker.phone].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-ink-900">{formatMoney(outstandingValue)}</p>
                      <p className="text-xs text-stone-500">
                        {outstandingCount} stone{outstandingCount === 1 ? "" : "s"} outstanding
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <table className="table-base hidden print:table">
              <thead>
                <tr>
                  <th className="w-8 print:hidden">
                    <span className="sr-only">Include in print</span>
                  </th>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Outstanding value</th>
                  <th>Outstanding stones</th>
                </tr>
              </thead>
              <tbody>
                {brokerStats.map(({ broker, outstandingCount, outstandingValue }) => (
                  <tr key={broker.id} data-print-row>
                    <td className="print:hidden">
                      <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include ${broker.name} in print`} />
                    </td>
                    <td className="font-medium">{broker.name}</td>
                    <td>{[broker.company, broker.phone].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{formatMoney(outstandingValue)}</td>
                    <td>{outstandingCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
