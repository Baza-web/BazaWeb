"use client";

import { useRef, useState, useTransition } from "react";
import { createExpense, scanReceipt } from "@/app/(app)/accounting/actions";

type BranchOption = { id: string; name: string };

export function ExpenseForm({
  branches,
  showBranchSelect,
  defaultBranchId,
}: {
  branches: BranchOption[];
  showBranchSelect: boolean;
  defaultBranchId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [scanning, startScan] = useTransition();
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  function runScan() {
    setScanError(null);
    const fd = new FormData();
    const file = fileRef.current?.files?.[0];
    if (file) {
      fd.set("image", file);
    } else if (pasteText.trim()) {
      fd.set("text", pasteText.trim());
    } else {
      setScanError("Add a photo or paste some text first.");
      return;
    }

    startScan(async () => {
      let result;
      try {
        result = await scanReceipt(fd);
      } catch {
        setScanError("That photo was too large or something went wrong — try a smaller image, or paste the text instead.");
        return;
      }
      if (result.error) setScanError(result.error);
      if (result.amount !== null) setAmount(String(result.amount));
      if (result.description !== null) setDescription(result.description);
      if (result.category !== null) setCategory(result.category);
      if (result.date !== null) setDate(result.date);
      setScanned(result.amount !== null || result.description !== null);
    });
  }

  return (
    <form action={createExpense} className="space-y-3">
      <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3">
        <p className="mb-2 text-sm font-medium text-ink-900">Scan a receipt (optional)</p>
        <p className="mb-2 text-xs text-stone-500">
          Upload a photo of a receipt/invoice, or paste the text of an order email — AI will try to fill in
          the fields below for you to check before saving.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} className="input text-xs" name="receiptImage" type="file" accept="image/*" />
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
            placeholder="Paste the email or order text here…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
        )}

        {scanError && <p className="mt-2 text-xs text-red-600">{scanError}</p>}
        {scanned && !scanError && (
          <p className="mt-2 text-xs text-green-700">Filled in below — check it over, then save.</p>
        )}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Category</label>
          <input
            className="input"
            name="category"
            placeholder="Rent, Supplies, Utilities…"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Amount</label>
          <input
            className="input"
            name="amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <label className="label">Description</label>
        <input
          className="input"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label">Date</label>
        <input className="input" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button type="submit" className="btn-primary">
        Add expense
      </button>
    </form>
  );
}
