import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canDeleteOrRequest } from "@/lib/rbac";
import { formatMoney, formatDate, formatDateTime } from "@/lib/utils";
import {
  addCustomerNote,
  updateCustomer,
  deleteCustomerPermanently,
  logCustomerActivity,
  toggleFollowUpDone,
  updateCustomerTags,
  updateCustomerStage,
} from "../actions";
import { getCustomerTimeline, type TimelineEntry } from "@/lib/customerTimeline";
import { computeRfmStats, classifyRfmSegment, RFM_SEGMENT_LABELS } from "@/lib/rfm";
import { EnvelopeSimple, Receipt, ChatCircle, Storefront, Wrench, PhoneCall, ArrowCounterClockwise, Tag } from "@/components/icons";
import { DeleteRecordButton } from "@/components/DeleteRecordButton";
import { PrintButton } from "@/components/PrintButton";
import { CancelRequestButton } from "@/components/CancelRequestButton";
import { CustomerTabs } from "@/components/CustomerTabs";
import { withdrawEditRequest } from "../../edit-requests/actions";
import type { CustomerStage } from "@prisma/client";

const STAGE_LABELS: Record<CustomerStage, string> = { LEAD: "Lead", PROSPECT: "Prospect", CUSTOMER: "Customer" };
const STAGE_BADGE_CLASS: Record<CustomerStage, string> = {
  LEAD: "bg-amber-50 text-amber-700",
  PROSPECT: "bg-sky-50 text-sky-700",
  CUSTOMER: "bg-green-50 text-green-700",
};
const SEGMENT_BADGE_CLASS: Record<string, string> = {
  CHAMPION: "bg-green-50 text-green-700",
  AT_RISK: "bg-amber-50 text-amber-700",
  LOST: "bg-stone-100 text-stone-500",
  NEW: "bg-sky-50 text-sky-700",
  NONE: "bg-stone-100 text-stone-400",
};

function toDateInput(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

function TimelineEntryRow({ entry, customerId }: { entry: TimelineEntry; customerId: string }) {
  if (entry.kind === "NOTE") {
    return (
      <li className="flex gap-3 border-t border-stone-100 pt-3 first:border-t-0 first:pt-0">
        <ChatCircle size={18} className="mt-0.5 shrink-0 text-stone-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p>{entry.body}</p>
          <p className="text-xs text-stone-400">
            {entry.staffName} · {formatDateTime(entry.at)}
          </p>
          {entry.followUpAt && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className={entry.followUpDone ? "text-stone-400 line-through" : "font-medium text-amber-700"}>
                Follow up {formatDate(entry.followUpAt)}
              </span>
              <form action={toggleFollowUpDone.bind(null, customerId, entry.id, !entry.followUpDone)} className="print:hidden">
                <button type="submit" className="text-brand-700 hover:underline">
                  {entry.followUpDone ? "Reopen" : "Mark done"}
                </button>
              </form>
            </div>
          )}
        </div>
      </li>
    );
  }
  if (entry.kind === "EMAIL") {
    return (
      <li className="flex gap-3 border-t border-stone-100 pt-3 first:border-t-0 first:pt-0">
        <EnvelopeSimple size={18} className="mt-0.5 shrink-0 text-stone-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{entry.subject}</p>
          <p className="text-xs text-stone-400">
            Emailed by {entry.staffName} · {formatDateTime(entry.at)}
          </p>
        </div>
      </li>
    );
  }
  if (entry.kind === "SALE") {
    return (
      <li className="flex gap-3 border-t border-stone-100 pt-3 first:border-t-0 first:pt-0">
        <Receipt size={18} className="mt-0.5 shrink-0 text-stone-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p>
            Purchase{" "}
            <Link href={`/sales/${entry.id}`} className="text-brand-700 hover:underline">
              {entry.invoiceNumber}
            </Link>{" "}
            — {formatMoney(entry.total)}
          </p>
          <p className="text-xs text-stone-400">{formatDateTime(entry.at)}</p>
        </div>
      </li>
    );
  }
  if (entry.kind === "REPAIR") {
    return (
      <li className="flex gap-3 border-t border-stone-100 pt-3 first:border-t-0 first:pt-0">
        <Wrench size={18} className="mt-0.5 shrink-0 text-stone-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p>
            {entry.type === "CUSTOM" ? "Custom order" : "Repair"} — {entry.description}
          </p>
          <p className="text-xs text-stone-400">
            {entry.status} · {formatDateTime(entry.at)}
          </p>
        </div>
      </li>
    );
  }
  // ACTIVITY
  const Icon = entry.type === "CALL" ? PhoneCall : entry.type === "VISIT" ? Storefront : ArrowCounterClockwise;
  const label = entry.type === "CALL" ? "Call" : entry.type === "VISIT" ? "Visit" : "Stage changed";
  return (
    <li className="flex gap-3 border-t border-stone-100 pt-3 first:border-t-0 first:pt-0">
      <Icon size={18} className="mt-0.5 shrink-0 text-stone-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p>
          {label}: {entry.note}
        </p>
        <p className="text-xs text-stone-400">
          {entry.staffName} · {formatDateTime(entry.at)}
        </p>
      </div>
    </li>
  );
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  const customer = await db.customer.findFirst({
    where: { id, ...branchScope(session) },
    include: { sales: { select: { total: true, createdAt: true } } },
  });
  if (!customer) notFound();

  const [pendingEdit, timeline] = await Promise.all([
    db.editRequest.findFirst({ where: { entityType: "CUSTOMER", entityId: customer.id, status: "PENDING" } }),
    getCustomerTimeline(customer.id),
  ]);

  const lifetimeValue = customer.sales.reduce((sum, s) => sum + s.total, 0);
  const segment = classifyRfmSegment(computeRfmStats(customer.sales));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="page-title">{customer.name}</h1>
          <p className="text-sm text-stone-500">
            {[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact info"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PrintButton label="Print" />
          {customer.email && (
            <Link href={`/email?customerId=${customer.id}`} className="btn-secondary inline-flex items-center gap-1.5 text-sm">
              <EnvelopeSimple size={16} aria-hidden="true" />
              Email
            </Link>
          )}
          {canDeleteOrRequest(session.role) && (
            <DeleteRecordButton
              action={deleteCustomerPermanently.bind(null, customer.id)}
              label="customer"
              isOwner={session.role === "OWNER"}
              confirmMessage={`Permanently delete ${customer.name}? This can't be undone.`}
              requestMessage={`Request permanent deletion of ${customer.name}? An Owner will need to approve it before anything happens.`}
              redirectTo="/customers"
            />
          )}
        </div>
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">{customer.name} — Customer statement</h2>
        <p className="text-sm text-stone-500">
          {[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact info"} · Printed{" "}
          {formatDate(new Date())}
        </p>
      </div>

      {pendingEdit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">An edit is awaiting Owner approval</p>
          <p className="mt-1 text-amber-700">
            {pendingEdit.fieldSummary} — requested {new Date(pendingEdit.createdAt).toLocaleDateString()}. No
            further edits can be made until that request is approved or rejected.
          </p>
          {pendingEdit.requestedById === session.staffId && (
            <CancelRequestButton onCancel={withdrawEditRequest.bind(null, pendingEdit.id)} />
          )}
        </div>
      )}

      <div className="card grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-stone-500">Lifetime value</p>
          <p className="text-lg font-semibold">{formatMoney(lifetimeValue)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Purchases</p>
          <p className="text-lg font-semibold">{customer.sales.length}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Birthday</p>
          <p className="text-lg font-semibold">{customer.birthday ? formatDate(customer.birthday) : "—"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className={`badge ${STAGE_BADGE_CLASS[customer.stage]}`}>{STAGE_LABELS[customer.stage]}</span>
        <span className={`badge ${SEGMENT_BADGE_CLASS[segment]}`}>{RFM_SEGMENT_LABELS[segment]}</span>
        {customer.tags.map((t) => (
          <span key={t} className="badge inline-flex items-center gap-1 bg-stone-100 text-stone-600">
            <Tag size={12} aria-hidden="true" />
            {t}
          </span>
        ))}
      </div>

      <CustomerTabs
        tabs={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <>
                <div className="card print:hidden">
                  <h2 className="mb-3 font-medium">Edit details</h2>
                  <form action={updateCustomer.bind(null, customer.id)} className="space-y-3">
                    <fieldset disabled={!!pendingEdit} className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label">Name</label>
                          <input className="input" name="name" defaultValue={customer.name} required />
                        </div>
                        <div>
                          <label className="label">Phone</label>
                          <input className="input" name="phone" defaultValue={customer.phone ?? ""} />
                        </div>
                        <div>
                          <label className="label">Email</label>
                          <input className="input" type="email" name="email" defaultValue={customer.email ?? ""} />
                        </div>
                        <div>
                          <label className="label">Address</label>
                          <input className="input" name="address" defaultValue={customer.address ?? ""} />
                        </div>
                        <div>
                          <label className="label">Birthday</label>
                          <input className="input" type="date" name="birthday" defaultValue={toDateInput(customer.birthday)} />
                        </div>
                        <div>
                          <label className="label">Anniversary</label>
                          <input className="input" type="date" name="anniversary" defaultValue={toDateInput(customer.anniversary)} />
                        </div>
                      </div>
                      <button type="submit" className="btn-primary">
                        Save changes
                      </button>
                      {session.role !== "OWNER" && (
                        <p className="text-xs text-stone-400">Saving will send this for an Owner to approve — nothing changes until then.</p>
                      )}
                    </fieldset>
                  </form>
                </div>

                <div className="card print:hidden">
                  <h2 className="mb-3 font-medium">Stage</h2>
                  <p className="mb-3 text-sm text-stone-500">
                    Where this person is in your pipeline — useful for custom-order inquiries before they become a sale.
                  </p>
                  <form action={updateCustomerStage.bind(null, customer.id)} className="flex items-center gap-2">
                    <select className="input max-w-[180px]" name="stage" defaultValue={customer.stage}>
                      {(["LEAD", "PROSPECT", "CUSTOMER"] as const).map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-secondary">
                      Update
                    </button>
                  </form>
                </div>

                <div className="card print:hidden">
                  <h2 className="mb-3 font-medium">Tags</h2>
                  <p className="mb-3 text-sm text-stone-500">Comma-separated — e.g. VIP, wholesale, gold-buyer.</p>
                  <form action={updateCustomerTags.bind(null, customer.id)} className="flex items-center gap-2">
                    <input className="input" name="tags" defaultValue={customer.tags.join(", ")} placeholder="VIP, wholesale…" />
                    <button type="submit" className="btn-secondary">
                      Save
                    </button>
                  </form>
                </div>
              </>
            ),
          },
          {
            id: "timeline",
            label: "Timeline",
            content: (
              <>
                <div className="card space-y-3 print:hidden">
                  <h2 className="font-medium">Add a note</h2>
                  <form action={addCustomerNote.bind(null, customer.id)} className="space-y-2">
                    <textarea className="input" name="body" rows={2} placeholder="Add a note…" required />
                    <div className="flex items-center gap-3">
                      <input className="input max-w-[200px]" name="followUpAt" type="date" />
                      <button type="submit" className="btn-secondary">
                        Save note
                      </button>
                    </div>
                  </form>

                  <h2 className="pt-2 font-medium">Log a call or visit</h2>
                  <form action={logCustomerActivity.bind(null, customer.id)} className="flex flex-wrap items-center gap-2">
                    <select className="input max-w-[140px]" name="type">
                      <option value="CALL">Call</option>
                      <option value="VISIT">Visit</option>
                    </select>
                    <input className="input flex-1" name="note" placeholder="What happened?" required />
                    <button type="submit" className="btn-secondary">
                      Log it
                    </button>
                  </form>
                </div>

                <div className="card">
                  <h2 className="mb-3 font-medium">Activity</h2>
                  {timeline.length === 0 ? (
                    <p className="text-sm text-stone-400">Nothing logged yet.</p>
                  ) : (
                    <ul className="space-y-3 text-sm">
                      {timeline.map((entry) => (
                        <TimelineEntryRow key={`${entry.kind}-${entry.id}`} entry={entry} customerId={customer.id} />
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
