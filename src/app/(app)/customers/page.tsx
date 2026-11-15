import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, isCompanyWide } from "@/lib/rbac";
import { createCustomer } from "./actions";
import { PrintButton } from "@/components/PrintButton";
import { formatDate } from "@/lib/utils";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const { q } = await searchParams;

  const [customers, branches] = await Promise.all([
    db.customer.findMany({
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
      },
      include: { _count: { select: { sales: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Customers</h1>
        <PrintButton selector="#customers-table" />
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">Customer list</h2>
        <p className="text-sm text-stone-500">
          {q ? `Filtered by "${q}" — ` : ""}Printed {formatDate(new Date())} — {customers.length} customer(s)
        </p>
      </div>

      <form className="card flex flex-wrap gap-3 print:hidden" action="/customers">
        <input className="input max-w-xs" name="q" placeholder="Search name, phone, email…" defaultValue={q} />
        <button type="submit" className="btn-secondary">
          Search
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
                <td>{c.email ?? "—"}</td>
                <td>{c._count.sales}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-stone-400">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
