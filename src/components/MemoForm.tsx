"use client";

import { useMemo, useState } from "react";
import { createMemo } from "@/app/(app)/brokers/actions";

type InventoryOption = { id: string; sku: string; name: string; sellingPrice: number; quantity: number };
type BrokerOption = { id: string; name: string };
type BranchOption = { id: string; name: string };
type Line = { inventoryItemId: string; quantity: number; valueEach: number };

export function MemoForm({
  inventory,
  brokers,
  branches,
  showBranchSelect,
  defaultBranchId,
}: {
  inventory: InventoryOption[];
  brokers: BrokerOption[];
  branches: BranchOption[];
  showBranchSelect: boolean;
  defaultBranchId: string;
}) {
  const [lines, setLines] = useState<Line[]>([]);

  const totalValue = useMemo(() => lines.reduce((sum, l) => sum + l.valueEach * l.quantity, 0), [lines]);

  function addLine() {
    const first = inventory.find((i) => !lines.some((l) => l.inventoryItemId === i.id));
    if (!first) return;
    setLines((prev) => [...prev, { inventoryItemId: first.id, quantity: 1, valueEach: first.sellingPrice }]);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function onItemChange(index: number, inventoryItemId: string) {
    const item = inventory.find((i) => i.id === inventoryItemId);
    updateLine(index, { inventoryItemId, valueEach: item?.sellingPrice ?? 0 });
  }

  if (brokers.length === 0) {
    return <p className="text-sm text-stone-400">Add a broker first, then issue a memo.</p>;
  }
  if (inventory.length === 0) {
    return <p className="text-sm text-stone-400">No in-stock items available to issue right now.</p>;
  }

  return (
    <form action={createMemo} className="space-y-4">
      <input type="hidden" name="itemsJson" value={JSON.stringify(lines)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Broker</label>
          <select className="input" name="brokerId" required defaultValue="">
            <option value="" disabled>
              Select broker…
            </option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
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
        <label className="label">Expected return date (optional)</label>
        <input className="input" name="expectedReturnAt" type="date" />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Items issued</label>
          <button type="button" onClick={addLine} className="btn-secondary text-xs">
            + Add item
          </button>
        </div>
        <div className="space-y-2">
          {lines.map((line, index) => {
            const item = inventory.find((i) => i.id === line.inventoryItemId);
            return (
              <div key={index} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <select
                  className="input w-full sm:flex-1"
                  value={line.inventoryItemId}
                  onChange={(e) => onItemChange(index, e.target.value)}
                >
                  {inventory.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.sku} — {i.name} ({i.quantity} in stock)
                    </option>
                  ))}
                </select>
                <input
                  className="input w-20 shrink-0"
                  type="number"
                  min={1}
                  max={item?.quantity ?? 1}
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                />
                <input
                  className="input w-24 shrink-0 sm:w-28"
                  type="number"
                  step="0.01"
                  value={line.valueEach}
                  onChange={(e) => updateLine(index, { valueEach: Number(e.target.value) })}
                />
                <button type="button" onClick={() => removeLine(index)} className="btn-danger shrink-0 text-xs">
                  Remove
                </button>
              </div>
            );
          })}
          {lines.length === 0 && <p className="text-sm text-stone-400">No items added yet.</p>}
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea className="input" name="notes" rows={2} />
      </div>

      <div className="flex items-center justify-between border-t border-stone-100 pt-4">
        <div className="text-lg font-semibold">Total value: {totalValue.toFixed(2)}</div>
        <button type="submit" className="btn-primary" disabled={lines.length === 0}>
          Issue memo
        </button>
      </div>
    </form>
  );
}
