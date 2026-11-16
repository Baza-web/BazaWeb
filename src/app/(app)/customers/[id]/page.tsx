import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canDeleteOrRequest } from "@/lib/rbac";
import { formatMoney, formatDate, formatDateTime } from "@/lib/utils";
import { addCustomerNote, updateCustomer, deleteCustomerPermanently } from "../actions";
import { EnvelopeSimple } from "@/components/icons";
import { DeleteRecordButton } from "@/components/DeleteRecordButton";
import { PrintButton } from "@/components/PrintButton";
import { CancelRequestButton } from "@/components/CancelRequestButton";
import { withdrawEditRequest } from "../../edit-requests/actions";

function toDateInput(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  const customer = await db.customer.findFirst({
    where: { id, ...branchScope(session) },
    include: {
      sales: { orderBy: { createdAt: "desc" } },
      notes: { include: { staff: true }, orderBy: { createdAt: "desc" } },
      emails: { include: { sentBy: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!customer) notFound();

  const pendingEdit = await db.editRequest.findFirst({
    where: { entityType: "CUSTOMER", entityId: customer.id, status: "PENDING" },
  });

  const lifetimeValue = customer.sales.reduce((sum, s) => sum + s.total, 0);

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

      <div className="card">
        <h2 className="mb-3 font-medium">Purchase history</h2>
        {customer.sales.length === 0 ? (
          <p className="text-sm text-stone-400">No purchases recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {customer.sales.map((s) => (
              <li key={s.id} className="flex justify-between">
                <Link href={`/sales/${s.id}`} className="text-brand-700 hover:underline">
                  {s.invoiceNumber}
                </Link>
                <span>{formatDate(s.createdAt)}</span>
                <span className="font-medium">{formatMoney(s.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {customer.emails.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-medium">Emails sent</h2>
          <ul className="space-y-3 text-sm">
            {customer.emails.map((e) => (
              <li key={e.id} className="border-t border-stone-100 pt-2 first:border-t-0 first:pt-0">
                <p className="font-medium">{e.subject}</p>
                <p className="text-xs text-stone-400">
                  {e.sentBy.name} · {formatDateTime(e.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-medium">Notes & follow-ups</h2>
        <form action={addCustomerNote.bind(null, customer.id)} className="mb-4 space-y-2 print:hidden">
          <textarea className="input" name="body" rows={2} placeholder="Add a note…" required />
          <div className="flex items-center gap-3">
            <input className="input max-w-[200px]" name="followUpAt" type="date" />
            <button type="submit" className="btn-secondary">
              Save note
            </button>
          </div>
        </form>
        <ul className="space-y-3 text-sm">
          {customer.notes.map((n) => (
            <li key={n.id} className="border-t border-stone-100 pt-2">
              <p>{n.body}</p>
              <p className="text-xs text-stone-400">
                {n.staff.name} · {formatDateTime(n.createdAt)}
                {n.followUpAt ? ` · Follow up ${formatDate(n.followUpAt)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
