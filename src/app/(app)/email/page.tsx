import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope } from "@/lib/rbac";
import { mailConnectConfigured } from "@/lib/googleMail";
import { formatDateTime } from "@/lib/utils";
import { EmailComposeForm } from "@/components/EmailComposeForm";
import { WarningCircle } from "@/components/icons";

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; q?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const { customerId, q } = await searchParams;
  const configured = mailConnectConfigured();

  const [customer, matches, recentEmails] = await Promise.all([
    customerId ? db.customer.findFirst({ where: { id: customerId, ...branchScope(session) } }) : Promise.resolve(null),
    !customerId && q
      ? db.customer.findMany({
          where: { ...branchScope(session), name: { contains: q, mode: "insensitive" } },
          take: 10,
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    db.emailLog.findMany({
      where: { customer: branchScope(session) },
      include: { customer: true, sentBy: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="page-title">Email</h1>

      {!configured && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>Gmail isn&apos;t connected yet — ask an Owner to connect it under Settings before sending.</p>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-medium">Compose</h2>
        {customer ? (
          <EmailComposeForm customerId={customer.id} customerName={customer.name} customerEmail={customer.email} disabled={!configured} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-stone-500">Find the customer you want to email.</p>
            <form className="flex flex-wrap gap-2" action="/email">
              <input className="input max-w-xs" name="q" placeholder="Search customer by name…" defaultValue={q} />
              <button type="submit" className="btn-secondary">
                Search
              </button>
            </form>
            {q && (
              <ul className="divide-y divide-stone-100">
                {matches.map((m) => (
                  <li key={m.id} className="py-2">
                    <Link href={`/email?customerId=${m.id}`} className="text-brand-700 hover:underline">
                      {m.name}
                    </Link>
                    <span className="ml-2 text-xs text-stone-400">{m.email ?? "no email on file"}</span>
                  </li>
                ))}
                {matches.length === 0 && <li className="py-2 text-sm text-stone-400">No customers matched.</li>}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Recently sent</h2>
        {recentEmails.length === 0 ? (
          <p className="text-sm text-stone-400">No emails sent yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {recentEmails.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <Link href={`/customers/${e.customerId}`} className="font-medium text-brand-700 hover:underline">
                    {e.customer.name}
                  </Link>
                  <span className="text-xs text-stone-400">{formatDateTime(e.createdAt)}</span>
                </div>
                <p className="text-stone-600">{e.subject}</p>
                <p className="text-xs text-stone-400">Sent by {e.sentBy.name}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
