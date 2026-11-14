import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope } from "@/lib/rbac";
import { formatMoney, formatDate, formatDateTime } from "@/lib/utils";
import { addCustomerNote } from "../actions";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  const customer = await db.customer.findFirst({
    where: { id, ...branchScope(session) },
    include: {
      sales: { orderBy: { createdAt: "desc" } },
      notes: { include: { staff: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!customer) notFound();

  const lifetimeValue = customer.sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">{customer.name}</h1>
        <p className="text-sm text-stone-500">
          {[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact info"}
        </p>
      </div>

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

      <div className="card">
        <h2 className="mb-3 font-medium">Notes & follow-ups</h2>
        <form action={addCustomerNote.bind(null, customer.id)} className="mb-4 space-y-2">
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
