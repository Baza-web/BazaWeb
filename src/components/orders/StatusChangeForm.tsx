"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeOrderStatus } from "@/app/(app)/orders/actions";
import type { OrderStatus } from "@prisma/client";

export function StatusChangeForm({
  orderId,
  currentStatus,
  statusOptions,
  restrictedStatuses,
  canManage,
  labels,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  statusOptions: OrderStatus[];
  restrictedStatuses: string[];
  canManage: boolean;
  labels: Record<OrderStatus, string>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await changeOrderStatus(orderId, formData);
        router.refresh();
      } catch (err) {
        // A blocked transition (e.g. the dispatch compliance gate) is an ordinary, expected
        // outcome here — surface it inline rather than letting it crash into a generic error page.
        setError(err instanceof Error ? err.message : "Couldn't update the status.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label">Change status</label>
        <select className="input text-sm" name="status" defaultValue={currentStatus}>
          {statusOptions.map((s) => (
            <option key={s} value={s} disabled={restrictedStatuses.includes(s) && !canManage}>
              {labels[s]}
              {restrictedStatuses.includes(s) && !canManage ? " (managers only)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Reason (optional)</label>
        <input className="input text-sm" name="reason" />
      </div>
      <button type="submit" disabled={isPending} className="btn-secondary text-sm disabled:opacity-50">
        {isPending ? "Updating…" : "Update status"}
      </button>
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
    </form>
  );
}
