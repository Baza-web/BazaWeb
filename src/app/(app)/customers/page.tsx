import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, isCompanyWide } from "@/lib/rbac";
import { createCustomer } from "./actions";

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
      <h1 className="text-xl font-semibold">Customers</h1>

      <form className="card flex flex-wrap gap-3" action="/customers">
        <input className="input max-w-xs" name="q" placeholder="Search name, phone, email…" defaultValue={q} />
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Purchases</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
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
                <td colSpan={4} className="py-6 text-center text-stone-400">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card max-w-lg">
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
          <div className="grid grid-cols-2 gap-3">
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
