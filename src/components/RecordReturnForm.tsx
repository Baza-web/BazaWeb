"use client";

import { useState } from "react";
import { requestMemoEdit } from "@/app/(app)/brokers/actions";

type Item = { id: string; name: string; sku: string; outstanding: number };

export function RecordReturnForm({ memoId, items }: { memoId: string; items: Item[] }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);

  function setQty(itemId: string, value: number, max: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, Math.min(value, max)) }));
  }

  const itemReturns = items
    .map((i) => ({ memoItemId: i.id, returnQuantity: quantities[i.id] ?? 0 }))
    .filter((r) => r.returnQuantity > 0);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-xs">
        Propose a return
      </button>
    );
  }

  return (
    <form action={requestMemoEdit.bind(null, memoId)} className="mt-2 space-y-2 rounded-lg bg-stone-50 p-3">
      <input type="hidden" name="itemReturnsJson" value={JSON.stringify(itemReturns)} />
      <p className="text-xs text-stone-500">
        How many of each item is the broker returning? This will need another Owner/Admin&apos;s approval
        before it&apos;s applied.
      </p>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <span className="flex-1 text-sm">
            {item.sku} — {item.name}
          </span>
          <input
            className="input w-20 text-sm"
            type="number"
            min={0}
            max={item.outstanding}
            placeholder="0"
            value={quantities[item.id] ?? ""}
            onChange={(e) => setQty(item.id, Number(e.target.value), item.outstanding)}
          />
          <span className="w-24 text-xs text-stone-400">of {item.outstanding} out</span>
        </div>
      ))}
      <input className="input text-sm" name="reason" placeholder="Reason / note for the approver (optional)" />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-xs">
          Cancel
        </button>
        <button type="submit" className="btn-primary text-xs" disabled={itemReturns.length === 0}>
          Submit for approval
        </button>
      </div>
    </form>
  );
}
