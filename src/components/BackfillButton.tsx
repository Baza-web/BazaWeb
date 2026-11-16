"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runBackfill } from "@/app/(app)/accounting/setup/actions";

export function BackfillButton({ unpostedSales, unpostedExpenses }: { unpostedSales: number; unpostedExpenses: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ salesPosted: number; expensesPosted: number } | null>(null);

  if (unpostedSales === 0 && unpostedExpenses === 0 && !result) {
    return <p className="text-sm text-green-700">Every sale and expense already has a journal entry — nothing to backfill.</p>;
  }

  function handleClick() {
    startTransition(async () => {
      const r = await runBackfill();
      setResult(r);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {(unpostedSales > 0 || unpostedExpenses > 0) && (
        <p className="text-sm text-amber-700">
          {unpostedSales} sale{unpostedSales === 1 ? "" : "s"} and {unpostedExpenses} expense{unpostedExpenses === 1 ? "" : "s"} have no
          journal entry yet — usually because they were recorded before auto-posting was turned on.
        </p>
      )}
      <button type="button" onClick={handleClick} disabled={isPending} className="btn-primary">
        {isPending ? "Posting…" : "Backfill now"}
      </button>
      {result && (
        <p className="text-sm text-green-700">
          Posted {result.salesPosted} sale and {result.expensesPosted} expense entries, using each record&apos;s own original date.
        </p>
      )}
    </div>
  );
}
