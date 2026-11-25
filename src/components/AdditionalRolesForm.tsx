"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStaffAdditionalRoles } from "@/app/(app)/staff/actions";

export function AdditionalRolesForm({
  staffId,
  currentAdditionalRoles,
  roleOptions,
  disabled,
}: {
  staffId: string;
  currentAdditionalRoles: string[];
  roleOptions: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setRequested(false);
    startTransition(async () => {
      try {
        const result = await updateStaffAdditionalRoles(staffId, formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        if (result.status === "requested") {
          setRequested(true);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't update extra roles.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-2">
      <fieldset disabled={disabled} className="space-y-2">
        <div className="flex flex-wrap gap-3">
          {roleOptions.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-sm text-stone-600">
              <input
                type="checkbox"
                name="additionalRoles"
                value={r.value}
                defaultChecked={currentAdditionalRoles.includes(r.value)}
                className="h-4 w-4 rounded border-stone-300"
              />
              {r.label}
            </label>
          ))}
        </div>
        <button type="submit" disabled={pending} className="btn-secondary text-sm disabled:opacity-50">
          {pending ? "Saving…" : "Save extra roles"}
        </button>
      </fieldset>
      {requested && <p className="text-xs text-amber-700">Change requested — awaiting approval.</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  );
}
