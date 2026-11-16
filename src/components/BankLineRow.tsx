"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { matchBankLine, unmatchBankLine, deleteBankStatementLine } from "@/app/(app)/accounting/bank-reconciliation/actions";
import { formatMoney, formatDate } from "@/lib/utils";

type Candidate = { id: string; entryNumber: string; description: string; date: string; movement: number };

export function BankLineRow({
  bankLineId,
  date,
  description,
  amount,
  reconciled,
  matchedEntryNumber,
  candidates,
}: {
  bankLineId: string;
  date: string;
  description: string;
  amount: number;
  reconciled: boolean;
  matchedEntryNumber?: string | null;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(candidates[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleMatch() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        await matchBankLine(bankLineId, selected);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't match that line.");
      }
    });
  }

  function handleUnmatch() {
    setError(null);
    startTransition(async () => {
      try {
        await unmatchBankLine(bankLineId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't unmatch that line.");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Remove this statement line? It wasn't matched to anything, so this just discards it.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteBankStatementLine(bankLineId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't remove that line.");
      }
    });
  }

  return (
    <tr>
      <td>{formatDate(new Date(date))}</td>
      <td className="max-w-xs text-xs">{description}</td>
      <td className={amount >= 0 ? "text-green-700" : "text-red-700"}>{formatMoney(amount)}</td>
      <td>
        {reconciled ? (
          <div className="flex items-center gap-2">
            <span className="badge bg-green-100 text-green-700">Matched: {matchedEntryNumber}</span>
            <button type="button" onClick={handleUnmatch} disabled={isPending} className="text-xs text-stone-500 hover:underline">
              Unmatch
            </button>
          </div>
        ) : candidates.length > 0 ? (
          <div className="flex items-center gap-2">
            <select className="input text-xs" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.entryNumber} · {formatDate(new Date(c.date))} · {c.description.slice(0, 30)}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleMatch} disabled={isPending} className="btn-secondary text-xs">
              Match
            </button>
            <button type="button" onClick={handleDelete} disabled={isPending} className="text-xs text-red-600 hover:underline">
              Discard
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400">No matching journal line found</span>
            <button type="button" onClick={handleDelete} disabled={isPending} className="text-xs text-red-600 hover:underline">
              Discard
            </button>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
