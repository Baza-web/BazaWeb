"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateExpense, deleteExpensePermanently } from "@/app/(app)/accounting/actions";
import { PencilSimple, Trash } from "@/components/icons";

export function ExpenseActions({
  expenseId,
  category,
  description,
  amount,
  date,
  isOwner,
  canDelete,
  locked,
}: {
  expenseId: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  isOwner: boolean;
  canDelete: boolean;
  /** True for expenses created from a Purchase Order payment — those can't be edited/deleted here, see accounting/actions.ts. */
  locked: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  if (locked) {
    return <span className="text-xs text-stone-400" title="Created from a Purchase Order payment — manage it there">—</span>;
  }

  function handleDelete() {
    const message = isOwner
      ? `Permanently delete this expense (${description})? This can't be undone.`
      : `Request permanent deletion of this expense (${description})? An Owner will need to approve it first.`;
    if (!confirm(message)) return;
    startTransition(async () => {
      try {
        const result = await deleteExpensePermanently(expenseId, new FormData());
        if (result.status === "requested") setRequested(true);
        else router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete this expense.");
      }
    });
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateExpense(expenseId, fd);
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save that change.");
      }
    });
  }

  if (requested) return <span className="text-xs text-amber-700">Pending</span>;

  if (editing) {
    return (
      <form onSubmit={handleSave} className="space-y-1 rounded-lg border border-stone-200 bg-white p-2 text-xs">
        <input className="input text-xs" name="category" defaultValue={category} required />
        <input className="input text-xs" name="description" defaultValue={description} required />
        <input className="input text-xs" name="amount" type="number" step="0.01" min="0.01" defaultValue={amount} required />
        <input className="input text-xs" name="date" type="date" defaultValue={date.slice(0, 10)} required />
        {error && <p className="text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={isPending} className="btn-primary text-xs">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-xs">
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setEditing(true)} className="text-stone-400 hover:text-brand-600" title="Edit">
        <PencilSimple size={14} aria-hidden="true" />
      </button>
      {canDelete && (
        <button type="button" onClick={handleDelete} disabled={isPending} className="text-stone-400 hover:text-red-600" title="Delete">
          <Trash size={14} aria-hidden="true" />
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
