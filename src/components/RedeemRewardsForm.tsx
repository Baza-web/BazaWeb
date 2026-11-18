"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { redeemRewardsAction } from "@/app/(app)/customers/actions";

export function RedeemRewardsForm({ customerId, balance }: { customerId: string; balance: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const outcome = await redeemRewardsAction(customerId, fd);
      if (outcome.error) {
        setError(outcome.error);
      } else {
        e.currentTarget.reset();
        router.refresh();
      }
    });
  }

  if (balance <= 0) {
    return <p className="text-sm text-stone-400">No reward balance to redeem yet.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          className="input max-w-[140px]"
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          max={balance}
          placeholder="Amount"
          required
        />
        <input className="input flex-1" name="note" placeholder="e.g. applied to invoice #1234 (optional)" />
        <button type="submit" disabled={isPending} className="btn-secondary text-sm">
          {isPending ? "Redeeming…" : "Redeem"}
        </button>
      </div>
      <p className="text-xs text-stone-400">
        Enter this same amount as a discount on the sale at checkout — this only updates the loyalty balance.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
