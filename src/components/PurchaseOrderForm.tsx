"use client";

import { useMemo, useState } from "react";
import { createPurchaseOrder } from "@/app/(app)/purchasing/actions";

type SupplierOption = { id: string; name: string };
type BranchOption = { id: string; name: string };
type Line = { description: string; quantity: number; unitCost: number };

export function PurchaseOrderForm({
  suppliers,
  branches,
  showBranchSelect,
  defaultBranchId,
}: {
  suppliers: SupplierOption[];
  branches: BranchOption[];
  showBranchSelect: boolean;
  defaultBranchId: string;
}) {
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: 1, unitCost: 0 }]);

  const total = useMemo(() => lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0), [lines]);

  function addLine() {
    setLines((prev) => [...prev, { description: "", quantity: 1, unitCost: 0 }]);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const validLines = lines.filter((l) => l.description.trim().length > 0);

  return (
    <form action={createPurchaseOrder} className="space-y-4">
      <input type="hidden" name="itemsJson" value={JSON.stringify(validLines)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Supplier</label>
          <select className="input" name="supplierId" required defaultValue="">
            <option value="" disabled>
              Select supplier…
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {showBranchSelect ? (
          <div>
            <label className="label">Branch</label>
            <select className="input" name="branchId" required defaultValue={defaultBranchId}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="branchId" value={defaultBranchId} />
        )}
      </div>

      <div>
        <label className="label">Expected delivery date</label>
        <input className="input" name="expectedDate" type="date" />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Items</label>
          <button type="button" onClick={addLine} className="btn-secondary text-xs">
            + Add item
          </button>
        </div>
        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <input
                className="input w-full sm:flex-1"
                placeholder="Description"
                value={line.description}
                onChange={(e) => updateLine(index, { description: e.target.value })}
              />
              <input
                className="input w-20 shrink-0"
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
              />
              <input
                className="input w-24 shrink-0 sm:w-28"
                type="number"
                step="0.01"
                min={0}
                value={line.unitCost}
                onChange={(e) => updateLine(index, { unitCost: Number(e.target.value) })}
              />
              <button
                type="button"
                onClick={() => removeLine(index)}
                className="btn-danger shrink-0 text-xs"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea className="input" name="notes" rows={2} />
      </div>

      <div className="flex items-center justify-between border-t border-stone-100 pt-4">
        <div className="text-lg font-semibold">Total: {total.toFixed(2)}</div>
        <button type="submit" className="btn-primary" disabled={validLines.length === 0}>
          Create purchase order
        </button>
      </div>
    </form>
  );
}
