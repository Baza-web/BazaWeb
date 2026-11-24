"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runSalesOrderBackfill } from "../actions";

export function BackfillSalesOrdersButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const { synced } = await runSalesOrderBackfill();
        setResult(synced === 0 ? "Already up to date — every sale has a linked order." : `Synced ${synced} sale${synced === 1 ? "" : "s"} to new orders.`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't run the sync.");
      }
    });
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={isPending} className="btn-secondary text-sm disabled:opacity-50">
        {isPending ? "Syncing…" : "Sync unsynced sales now"}
      </button>
      {result && <p className="mt-2 text-xs text-emerald-700">{result}</p>}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
