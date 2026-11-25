import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageSupplyCatalog, canCheckOutSuppliesOrTools, isCompanyWide } from "@/lib/rbac";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import {
  createSupplyItem,
  restockSupplyItem,
  issueSupply,
  deleteSupplyItem,
  createWorkshopTool,
  checkOutTool,
  returnTool,
  logToolMaintenance,
  deleteWorkshopTool,
} from "./actions";
import { Toolbox, Trash } from "@/components/icons";

const CATEGORY_LABELS: Record<string, string> = {
  OFFICE_SUPPLY: "Office supply",
  JEWELLERY_BOX: "Jewellery box",
  PACKAGING: "Packaging",
  CONSUMABLE: "Consumable",
};

export default async function WorkshopPage() {
  const session = await requireSessionOrRedirect();
  if (!canCheckOutSuppliesOrTools(session.roles) && !canManageSupplyCatalog(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const canManage = canManageSupplyCatalog(session.roles);
  const canCheckOut = canCheckOutSuppliesOrTools(session.roles);

  const [supplies, tools, staff, branches] = await Promise.all([
    db.supplyItem.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    db.workshopTool.findMany({ include: { assignedStaff: true, maintenanceLogs: { orderBy: { date: "desc" }, take: 3 } }, orderBy: { name: "asc" } }),
    isCompanyWide(session.roles)
      ? db.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } })
      : db.staff.findMany({ where: { active: true, branchId: session.branchId ?? undefined }, orderBy: { name: "asc" } }),
    canManage ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="page-title flex items-center gap-2">
        <Toolbox size={26} className="text-brand-500" aria-hidden="true" />
        Workshop &amp; Supplies
      </h1>
      <p className="text-sm text-stone-500">
        Office stationery, jewellery boxes, packaging and consumables, plus reusable workshop tools — tracked
        separately from sellable Inventory, since neither has a sale-driven lifecycle.
      </p>

      <div className="card">
        <h2 className="section-title mb-3">Supplies</h2>
        {supplies.length === 0 ? (
          <p className="mb-3 text-sm text-stone-400">No supply items yet.</p>
        ) : (
          <div className="mb-4 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Item</th><th>Category</th><th>Qty</th><th>Min.</th><th></th>
                  {canCheckOut && <th>Issue</th>}
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {supplies.map((s) => {
                  const low = s.quantity <= s.minimumStock;
                  return (
                    <tr key={s.id}>
                      <td>{s.name} <span className="text-xs text-stone-400">({s.sku})</span></td>
                      <td>{CATEGORY_LABELS[s.category]}</td>
                      <td className={low ? "font-medium text-red-700" : ""}>{s.quantity}{s.unit ? ` ${s.unit}` : ""}</td>
                      <td>{s.minimumStock}</td>
                      <td>{low && <span className="badge bg-red-100 text-red-700">Reorder</span>}</td>
                      {canCheckOut && (
                        <td>
                          <form action={issueSupply.bind(null, s.id)} className="flex items-center gap-1">
                            <input className="input text-xs w-16" type="number" min="1" max={s.quantity} name="quantity" defaultValue={1} required />
                            <button type="submit" className="btn-secondary text-xs">Issue</button>
                          </form>
                        </td>
                      )}
                      {canManage && (
                        <td>
                          <div className="flex items-center gap-2">
                            <form action={restockSupplyItem.bind(null, s.id)} className="flex items-center gap-1">
                              <input className="input text-xs w-16" type="number" min="1" name="amount" placeholder="+qty" required />
                              <button type="submit" className="btn-secondary text-xs">Restock</button>
                            </form>
                            <form action={deleteSupplyItem.bind(null, s.id)}>
                              <button type="submit" className="text-red-600 hover:underline" aria-label="Remove"><Trash size={14} /></button>
                            </form>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {canManage && (
          <form action={createSupplyItem} className="grid grid-cols-2 gap-2 border-t border-stone-100 pt-3 sm:grid-cols-4">
            <input className="input text-sm" name="sku" placeholder="SKU" required />
            <input className="input text-sm" name="name" placeholder="Name" required />
            <select className="input text-sm" name="category" required defaultValue="OFFICE_SUPPLY">
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <input className="input text-sm" name="unit" placeholder="Unit (box, pc…)" />
            <input className="input text-sm" type="number" name="quantity" placeholder="Opening qty" />
            <input className="input text-sm" type="number" name="minimumStock" placeholder="Reorder level" />
            <input className="input text-sm" type="number" step="0.01" name="purchasePrice" placeholder="Purchase price" />
            <select className="input text-sm" name="branchId" defaultValue="">
              <option value="">Any branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button type="submit" className="btn-primary text-sm col-span-2">Add supply item</button>
          </form>
        )}
      </div>

      <div className="card">
        <h2 className="section-title mb-3">Workshop tools</h2>
        {tools.length === 0 ? (
          <p className="mb-3 text-sm text-stone-400">No tools recorded yet.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {tools.map((t) => (
              <li key={t.id} className="rounded-lg bg-stone-50 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink-900">{t.name} <span className="text-xs text-stone-400">({t.toolId})</span></p>
                    <p className="text-xs text-stone-500">
                      {t.assignedStaff ? `Checked out to ${t.assignedStaff.name}` : "In storage"}
                      {t.expectedReturnDate ? ` · expected back ${formatDate(t.expectedReturnDate)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`badge shrink-0 ${
                      t.condition === "GOOD" ? "bg-emerald-100 text-emerald-700" : t.condition === "UNDER_MAINTENANCE" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {t.condition.replace("_", " ")}
                  </span>
                </div>
                {canCheckOut && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    {t.assignedStaff ? (
                      <form action={returnTool.bind(null, t.id)} className="flex flex-wrap items-end gap-2">
                        <select className="input text-xs" name="condition" defaultValue="GOOD">
                          <option value="GOOD">Returned — good</option>
                          <option value="DAMAGED">Returned — damaged</option>
                          <option value="MISSING">Not returned — missing</option>
                          <option value="UNDER_MAINTENANCE">Returned — needs maintenance</option>
                        </select>
                        <button type="submit" className="btn-secondary text-xs">Record return</button>
                      </form>
                    ) : (
                      <form action={checkOutTool.bind(null, t.id)} className="flex flex-wrap items-end gap-2">
                        <select className="input text-xs" name="assignedStaffId" required defaultValue="">
                          <option value="" disabled>Check out to…</option>
                          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <input className="input text-xs" type="date" name="expectedReturnDate" />
                        <button type="submit" className="btn-secondary text-xs">Check out</button>
                      </form>
                    )}
                  </div>
                )}
                {canManage && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-stone-200 pt-2">
                    <form action={logToolMaintenance.bind(null, t.id)} className="flex flex-wrap items-end gap-2">
                      <input className="input text-xs flex-1 min-w-[140px]" name="note" placeholder="Maintenance note" required />
                      <input className="input text-xs w-24" type="number" step="0.01" name="cost" placeholder="Cost" />
                      <button type="submit" className="btn-secondary text-xs">Log maintenance (marks Good)</button>
                    </form>
                    <form action={deleteWorkshopTool.bind(null, t.id)}>
                      <button type="submit" className="text-red-600 hover:underline" aria-label="Remove"><Trash size={14} /></button>
                    </form>
                  </div>
                )}
                {t.maintenanceLogs.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-stone-500">
                    {t.maintenanceLogs.map((log) => (
                      <li key={log.id}>{formatDate(log.date)}: {log.note}{log.cost ? ` (${log.cost})` : ""}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <form action={createWorkshopTool} className="flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
            <input className="input text-sm" name="toolId" placeholder="Tool ID" required />
            <input className="input text-sm flex-1 min-w-[160px]" name="name" placeholder="Tool name" required />
            <input className="input text-sm flex-1 min-w-[160px]" name="notes" placeholder="Notes" />
            <button type="submit" className="btn-primary text-sm">Add tool</button>
          </form>
        )}
      </div>
    </div>
  );
}
