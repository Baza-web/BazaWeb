"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AssignRepairStaffForm({
  orderId,
  action,
  fieldName,
  defaultValue,
  options,
}: {
  orderId: string;
  action: (orderId: string, formData: FormData) => Promise<{ error: string } | { ok: true }>;
  fieldName: string;
  defaultValue: string;
  options: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(orderId, formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't update this assignment.");
      }
    });
  }

  return (
    <div>
      <form action={handleSubmit} className="flex items-center gap-1">
        <select className="input text-xs" name={fieldName} defaultValue={defaultValue}>
          <option value="">Unassigned</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="btn-secondary text-xs disabled:opacity-50">
          {pending ? "Saving…" : "Set"}
        </button>
      </form>
      {error && <p className="mt-1 w-40 text-xs text-red-700">{error}</p>}
    </div>
  );
}
