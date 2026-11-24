"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatMoney } from "@/lib/utils";
import { updateRepairOrder, deleteRepairOrder, updateRepairStatus, assignRepairOrder, assignSalesRepairOrder } from "@/app/(app)/repairs/actions";
import { AssignRepairStaffForm } from "@/components/AssignRepairStaffForm";

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: "bg-stone-100 text-stone-600",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  READY: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

type Order = {
  id: string;
  type: string;
  description: string;
  promisedDate: Date | null;
  estimatedCost: number | null;
  finalCost: number | null;
  status: string;
  assignedToId: string | null;
  assignedSalesId: string | null;
  relatedInventoryItemId: string | null;
  branchId: string;
  customer: { name: string };
  assignedTo: { name: string } | null;
  assignedSales: { name: string } | null;
  branch: { name: string };
};

export function RepairOrderRow({
  order,
  showBranch,
  canManage,
  canEditDelete,
  canUpdateThis,
  craftsmanOptions,
  salesOptions,
  productOptions,
}: {
  order: Order;
  showBranch: boolean;
  canManage: boolean;
  canEditDelete: boolean;
  canUpdateThis: boolean;
  craftsmanOptions: { id: string; name: string }[];
  salesOptions: { id: string; name: string }[];
  productOptions: { id: string; name: string; sku: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleEditSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateRepairOrder(order.id, formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't update this order.");
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Delete this ${order.type === "CUSTOM" ? "custom order" : "repair"} for ${order.customer.name}? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteRepairOrder(order.id);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete this order.");
      }
    });
  }

  return (
    <>
      <tr data-print-row>
        <td className="print:hidden">
          <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include ${order.customer.name}'s order in print`} />
        </td>
        <td>
          <p className="font-medium text-ink-900">{order.customer.name}</p>
          {showBranch && <p className="text-xs text-stone-400">{order.branch.name}</p>}
        </td>
        <td>{order.type === "CUSTOM" ? "Custom" : "Repair"}</td>
        <td className="max-w-xs truncate">{order.description}</td>
        <td>{order.promisedDate ? formatDate(order.promisedDate) : "—"}</td>
        <td>
          {order.finalCost ? formatMoney(order.finalCost) : order.estimatedCost ? `~${formatMoney(order.estimatedCost)}` : "—"}
        </td>
        <td>
          <span className="print:hidden">
            {canManage ? (
              <AssignRepairStaffForm
                orderId={order.id}
                action={assignRepairOrder}
                fieldName="assignedToId"
                defaultValue={order.assignedToId ?? ""}
                options={craftsmanOptions}
              />
            ) : (
              order.assignedTo?.name ?? "—"
            )}
          </span>
          <span className="hidden print:inline">{order.assignedTo?.name ?? "—"}</span>
        </td>
        <td>
          <span className="print:hidden">
            {canManage ? (
              <AssignRepairStaffForm
                orderId={order.id}
                action={assignSalesRepairOrder}
                fieldName="assignedSalesId"
                defaultValue={order.assignedSalesId ?? ""}
                options={salesOptions}
              />
            ) : (
              order.assignedSales?.name ?? "—"
            )}
          </span>
          <span className="hidden print:inline">{order.assignedSales?.name ?? "—"}</span>
        </td>
        <td>
          <span className={`badge ${STATUS_STYLES[order.status]}`}>{order.status.replace("_", " ")}</span>
        </td>
        {canManage && (
          <td className="print:hidden">
            {canUpdateThis && (
              <form action={updateRepairStatus.bind(null, order.id)} className="flex flex-wrap items-center gap-2">
                <select className="input text-xs" name="status" defaultValue={order.status}>
                  <option value="RECEIVED">Received</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="READY">Ready</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <input className="input text-xs w-24" name="finalCost" type="number" step="0.01" min="0" placeholder="Final cost" defaultValue={order.finalCost ?? ""} />
                <button type="submit" className="btn-secondary text-xs">
                  Save
                </button>
              </form>
            )}
          </td>
        )}
        {canEditDelete && (
          <td className="print:hidden">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEditing((v) => !v)} className="text-xs text-brand-600 hover:underline">
                {editing ? "Cancel" : "Edit"}
              </button>
              <button type="button" onClick={handleDelete} disabled={pending} className="text-xs text-red-600 hover:underline disabled:opacity-50">
                Delete
              </button>
            </div>
          </td>
        )}
      </tr>
      {editing && (
        <tr className="print:hidden">
          {/* colSpan is intentionally larger than the real column count — browsers clamp it to
              however many columns the table actually has, so this spans the full row regardless
              of which optional columns (Update, Actions) are present. */}
          <td colSpan={12} className="bg-stone-50 p-4">
            <form action={handleEditSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Type</label>
                <select className="input" name="type" defaultValue={order.type}>
                  <option value="REPAIR">Repair</option>
                  <option value="CUSTOM">Custom order</option>
                </select>
              </div>
              <div>
                <label className="label">Product (optional)</label>
                <select className="input" name="relatedInventoryItemId" defaultValue={order.relatedInventoryItemId ?? ""}>
                  <option value="">— Custom / not in catalogue —</option>
                  {productOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description</label>
                <textarea className="input" name="description" rows={2} required defaultValue={order.description} />
              </div>
              <div>
                <label className="label">Promised date</label>
                <input
                  className="input"
                  name="promisedDate"
                  type="date"
                  defaultValue={order.promisedDate ? new Date(order.promisedDate).toISOString().slice(0, 10) : ""}
                />
              </div>
              <div>
                <label className="label">Estimated cost</label>
                <input className="input" name="estimatedCost" type="number" step="0.01" min="0" defaultValue={order.estimatedCost ?? ""} />
              </div>
              {error && <p className="sm:col-span-2 text-xs text-red-700">{error}</p>}
              <div className="sm:col-span-2 flex gap-2">
                <button type="submit" disabled={pending} className="btn-primary text-sm disabled:opacity-50">
                  {pending ? "Saving…" : "Save changes"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
