import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canCreateOrders, isCompanyWide } from "@/lib/rbac";
import { createOrder } from "../actions";
import { Plus } from "@/components/icons";

export default async function NewOrderPage() {
  const session = await requireSessionOrRedirect();
  if (!canCreateOrders(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const scope = branchScope(session);

  const [brands, customers, staffList, branches, departmentRows] = await Promise.all([
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: scope, orderBy: { name: "asc" }, take: 1000 }),
    isCompanyWide(session.roles)
      ? db.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } })
      : db.staff.findMany({ where: { active: true, branchId: session.branchId ?? undefined }, orderBy: { name: "asc" } }),
    isCompanyWide(session.roles) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.order.findMany({ where: { department: { not: null } }, select: { department: true }, distinct: ["department"] }),
  ]);

  const departments = departmentRows.map((d) => d.department).filter(Boolean) as string[];
  const defaultDeadline = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Plus size={24} className="text-brand-500" aria-hidden="true" />
          Create New Order
        </h1>
        <p className="text-sm text-stone-500">An order number is generated automatically once saved.</p>
      </div>

      <form action={createOrder} className="card space-y-5" encType="multipart/form-data">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Brand</label>
            <select className="input" name="brandId" defaultValue="">
              <option value="">No specific brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Order type</label>
            <input className="input" name="orderType" required placeholder="Custom jewellery, repair, wholesale…" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Customer (existing)</label>
            <select className="input" name="customerId" defaultValue="">
              <option value="">Walk-in / not in CRM yet</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Customer contact (if not linked above)</label>
            <input className="input" name="customerContact" placeholder="Name and phone/email" />
          </div>
        </div>

        <div>
          <label className="label">Product or service</label>
          <input className="input" name="productOrService" required placeholder="18k gold engagement ring, repair of…" />
        </div>

        <div>
          <label className="label">Order description</label>
          <textarea className="input" name="description" rows={2} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Product specifications</label>
            <textarea className="input" name="specifications" rows={2} placeholder="Metal, carat, size, stones…" />
          </div>
          <div>
            <label className="label">Customization requirements</label>
            <textarea className="input" name="customizationRequirements" rows={2} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Quantity</label>
            <input className="input" type="number" min="1" name="quantity" defaultValue={1} />
          </div>
          <div>
            <label className="label">Order value (LKR, if applicable)</label>
            <input className="input" type="number" min="0" step="0.01" name="orderValue" />
          </div>
          <div>
            <label className="label">Department</label>
            <input className="input" name="department" list="department-options" placeholder="Design, Manufacturing, QC…" />
            <datalist id="department-options">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Promised deadline</label>
            <input className="input" type="datetime-local" name="promisedDeadline" required defaultValue={defaultDeadline} />
          </div>
          <div>
            <label className="label">Manual priority (optional)</label>
            <select className="input" name="manualPriority" defaultValue="">
              <option value="">Use automatic priority</option>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div>
            <label className="label">Initial status</label>
            <select className="input" name="status" defaultValue="NEW_ORDER">
              <option value="NEW_ORDER">New Order</option>
              <option value="ORDER_CONFIRMED">Order Confirmed</option>
              <option value="ASSIGNED">Assigned</option>
            </select>
          </div>
        </div>

        {isCompanyWide(session.roles) && (
          <div>
            <label className="label">Branch</label>
            <select className="input" name="branchId" defaultValue={session.branchId ?? ""}>
              <option value="">Company-wide</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Primary responsible employee</label>
          <select className="input" name="primaryStaffId" required defaultValue="">
            <option value="" disabled>Select employee…</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Supporting employees (optional)</label>
          <div className="mt-1 grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-stone-200 p-2 sm:grid-cols-2">
            {staffList.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-stone-50">
                <input type="checkbox" name="supportingStaffIds" value={s.id} className="h-4 w-4 rounded border-stone-300" />
                {s.name}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Internal instructions (staff only)</label>
            <textarea className="input" name="internalInstructions" rows={2} />
          </div>
          <div>
            <label className="label">Customer instructions</label>
            <textarea className="input" name="customerInstructions" rows={2} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Reference images</label>
            <input className="input" type="file" name="referenceImages" accept="image/*" multiple />
          </div>
          <div>
            <label className="label">Supporting documents</label>
            <input className="input" type="file" name="supportingDocuments" accept="image/*,.pdf" multiple />
          </div>
        </div>

        <button type="submit" className="btn-primary">Create order</button>
      </form>
    </div>
  );
}
