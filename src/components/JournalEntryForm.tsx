"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createJournalEntry } from "@/app/(app)/accounting/journal-entries/actions";

type Account = { id: string; code: string; name: string; type: string };
type Line = { accountId: string; debit: string; credit: string };

const emptyLine = (): Line => ({ accountId: "", debit: "", credit: "" });

export function JournalEntryForm({
  accounts,
  branches,
  showBranchSelect,
  defaultBranchId,
}: {
  accounts: Account[];
  branches: { id: string; name: string }[];
  showBranchSelect: boolean;
  defaultBranchId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine()]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!balanced) {
      setError("Total debits must equal total credits before you can post this entry.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set(
      "linesJson",
      JSON.stringify(
        lines
          .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
          .map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
      ),
    );
    startTransition(async () => {
      try {
        await createJournalEntry(fd);
        setLines([emptyLine(), emptyLine()]);
        formRef.current?.reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't post this entry.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Date</label>
          <input className="input" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
        </div>
        <div>
          <label className="label">Reference (optional)</label>
          <input className="input" name="reference" placeholder="Invoice #, receipt #…" />
        </div>
        {showBranchSelect ? (
          <div>
            <label className="label">Branch</label>
            <select className="input" name="branchId" defaultValue={defaultBranchId}>
              <option value="">Company-wide</option>
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
          <label className="label">Department (optional)</label>
          <input className="input" name="department" placeholder="e.g. Sales, Workshop…" />
        </div>
      </div>
      <div>
        <label className="label">Description</label>
        <input className="input" name="description" required />
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-stone-500">
          <span className="col-span-6">Account</span>
          <span className="col-span-3">Debit</span>
          <span className="col-span-3">Credit</span>
        </div>
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <select
              className="input col-span-6 text-sm"
              value={line.accountId}
              onChange={(e) => updateLine(i, { accountId: e.target.value })}
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
            <input
              className="input col-span-3 text-sm"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={line.debit}
              onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
            />
            <input
              className="input col-span-3 text-sm"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={line.credit}
              onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
            />
          </div>
        ))}
        <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])} className="btn-secondary text-xs">
          + Add line
        </button>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
        <span>Total debit: <span className="font-medium">{totalDebit.toFixed(2)}</span></span>
        <span>Total credit: <span className="font-medium">{totalCredit.toFixed(2)}</span></span>
        <span className={balanced ? "font-medium text-green-700" : "font-medium text-red-600"}>
          {balanced ? "Balanced" : "Not balanced"}
        </span>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button type="submit" disabled={isPending || !balanced} className="btn-primary">
        {isPending ? "Posting…" : "Post entry"}
      </button>
    </form>
  );
}
