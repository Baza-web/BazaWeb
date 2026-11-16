"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CancelRequestButton({ onCancel }: { onCancel: () => Promise<void> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm("Withdraw this request? Nothing has changed yet, so there's nothing to undo.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await onCancel();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't withdraw this request.");
      }
    });
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={handleClick} disabled={isPending} className="text-xs font-medium text-amber-800 underline disabled:opacity-50">
        Withdraw this request
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
