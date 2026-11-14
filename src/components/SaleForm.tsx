"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createSale, scanOrder } from "@/app/(app)/sales/actions";

type InventoryOption = {
  id: string;
  sku: string;
  name: string;
  sellingPrice: number;
  quantity: number;
  branchId: string;
};

type CustomerOption = { id: string; name: string; branchId: string };
type BranchOption = { id: string; name: string };

type Line = { inventoryItemId: string; quantity: number; priceEach: number };

export function SaleForm({
  inventory,
  customers,
  branches,
  showBranchSelect,
  defaultBranchId,
}: {
  inventory: InventoryOption[];
  customers: CustomerOption[];
  branches: BranchOption[];
  showBranchSelect: boolean;
  defaultBranchId: string;
}) {
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER" | "MOBILE_MONEY" | "OTHER">("CASH");
  const [notes, setNotes] = useState("");

  const scanFileRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [scanning, startScan] = useTransition();
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const branchInventory = useMemo(() => inventory.filter((i) => i.branchId === branchId), [inventory, branchId]);
  const branchCustomers = useMemo(() => customers.filter((c) => c.branchId === branchId), [customers, branchId]);

  function runScan() {
    setScanError(null);
    setScanNotice(null);
    const fd = new FormData();
    const file = scanFileRef.current?.files?.[0];
    if (file) {
      fd.set("image", file);
    } else if (pasteText.trim()) {
      fd.set("text", pasteText.trim());
    } else {
      setScanError("Add a screenshot or paste some chat text first.");
      return;
    }

    startScan(async () => {
      let result;
      try {
        result = await scanOrder(branchId, fd);
      } catch {
        setScanError("That screenshot was too large or something went wrong — try a smaller image, or paste the chat text instead.");
        return;
      }
      if (result.error) {
        setScanError(result.error);
        return;
      }
      if (result.customerId) setCustomerId(result.customerId);
      if (result.lines.length > 0) {
        setLines(
          result.lines
            .filter((l) => l.inventoryItemId)
            .map((l) => ({ inventoryItemId: l.inventoryItemId!, quantity: l.quantity, priceEach: l.priceEach ?? 0 })),
        );
      }
      if (result.discount != null) setDiscount(result.discount);
      if (result.amountPaid != null) setAmountPaid(result.amountPaid);
      if (result.paymentMethod) setPaymentMethod(result.paymentMethod);
      if (result.notes) setNotes(result.notes);

      const notices: string[] = [];
      if (result.customerNameGuess && !result.customerId) {
        notices.push(`Found customer "${result.customerNameGuess}" but no match in your customer list — add them or pick manually.`);
      }
      if (result.unmatchedItems.length > 0) {
        notices.push(`Couldn't match: ${result.unmatchedItems.join(", ")} — add these manually below.`);
      }
      if (notices.length === 0 && result.lines.length > 0) {
        notices.push("Filled in below — check it over before recording the sale.");
      }
      if (notices.length > 0) setScanNotice(notices.join(" "));
    });
  }

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.priceEach * l.quantity, 0),
    [lines],
  );
  const total = Math.max(subtotal - discount + tax, 0);

  function onBranchChange(nextBranchId: string) {
    setBranchId(nextBranchId);
    // Items and the selected customer belong to a specific branch — clear
    // them so a branch switch can never submit another branch's selections.
    setLines([]);
    setCustomerId("");
  }

  function addLine() {
    const first = branchInventory.find((i) => !lines.some((l) => l.inventoryItemId === i.id));
    if (!first) return;
    setLines((prev) => [...prev, { inventoryItemId: first.id, quantity: 1, priceEach: first.sellingPrice }]);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function onItemChange(index: number, inventoryItemId: string) {
    const item = branchInventory.find((i) => i.id === inventoryItemId);
    updateLine(index, { inventoryItemId, priceEach: item?.sellingPrice ?? 0 });
  }

  return (
    <form action={createSale} className="card space-y-5">
      <input type="hidden" name="itemsJson" value={JSON.stringify(lines)} />

      <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3">
        <p className="mb-2 text-sm font-medium text-ink-900">Scan an order (optional)</p>
        <p className="mb-2 text-xs text-stone-500">
          Upload a screenshot of a WhatsApp order, or paste the chat text — AI will try to match the
          customer and items against your records and fill in the form below for you to check.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input ref={scanFileRef} className="input text-xs" type="file" accept="image/*" />
          <button type="button" onClick={() => setPasteOpen((v) => !v)} className="btn-secondary text-xs">
            {pasteOpen ? "Hide paste box" : "Paste text instead"}
          </button>
          <button type="button" onClick={runScan} disabled={scanning} className="btn-primary text-xs">
            {scanning ? "Reading…" : "Scan"}
          </button>
        </div>

        {pasteOpen && (
          <textarea
            className="input mt-2 text-xs"
            rows={3}
            placeholder="Paste the WhatsApp chat text here…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
        )}

        {scanError && <p className="mt-2 text-xs text-red-600">{scanError}</p>}
        {scanNotice && !scanError && <p className="mt-2 text-xs text-amber-700">{scanNotice}</p>}
      </div>

      {showBranchSelect ? (
        <div>
          <label className="label">Branch</label>
          <select
            className="input"
            name="branchId"
            value={branchId}
            onChange={(e) => onBranchChange(e.target.value)}
            required
          >
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

      <div>
        <label className="label">Customer (optional — leave blank for walk-in)</label>
        <select
          className="input"
          name="customerId"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">Walk-in customer</option>
          {branchCustomers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Items</label>
          <button type="button" onClick={addLine} className="btn-secondary text-xs">
            + Add item
          </button>
        </div>

        <div className="space-y-2">
          {lines.map((line, index) => {
            const item = branchInventory.find((i) => i.id === line.inventoryItemId);
            return (
              <div key={index} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <select
                  className="input w-full sm:flex-1"
                  value={line.inventoryItemId}
                  onChange={(e) => onItemChange(index, e.target.value)}
                >
                  {branchInventory.map((i) => (
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
                  value={line.priceEach}
                  onChange={(e) => updateLine(index, { priceEach: Number(e.target.value) })}
                />
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  className="btn-danger shrink-0 text-xs"
                >
                  Remove
                </button>
              </div>
            );
          })}
          {lines.length === 0 && <p className="text-sm text-stone-400">No items added yet.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Discount</label>
          <input
            className="input"
            name="discount"
            type="number"
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Tax</label>
          <input
            className="input"
            name="tax"
            type="number"
            step="0.01"
            value={tax}
            onChange={(e) => setTax(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Amount paid now</label>
          <input
            className="input"
            name="amountPaid"
            type="number"
            step="0.01"
            value={amountPaid}
            onChange={(e) => setAmountPaid(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Payment method</label>
          <select
            className="input"
            name="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
          >
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="MOBILE_MONEY">Mobile money</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea className="input" name="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex items-center justify-between border-t border-stone-100 pt-4">
        <div className="text-sm text-stone-500">
          Subtotal: {subtotal.toFixed(2)} · Discount: {discount.toFixed(2)} · Tax: {tax.toFixed(2)}
        </div>
        <div className="text-lg font-semibold">Total: {total.toFixed(2)}</div>
      </div>

      <button type="submit" className="btn-primary" disabled={lines.length === 0}>
        Record sale
      </button>
    </form>
  );
}
