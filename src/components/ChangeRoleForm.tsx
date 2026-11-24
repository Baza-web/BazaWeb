"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStaffRole } from "@/app/(app)/staff/actions";

export function ChangeRoleForm({
  staffId,
  currentRole,
  roleOptions,
  disabled,
}: {
  staffId: string;
  currentRole: string;
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
        const result = await updateStaffRole(staffId, formData);
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
        setError(err instanceof Error ? err.message : "Couldn't change this role.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-2">
      <fieldset disabled={disabled} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Role</label>
          <select className="input" name="role" defaultValue={currentRole}>
            {roleOptions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
          {pending ? "Saving…" : "Change role"}
        </button>
      </fieldset>
      {requested && <p className="w-full text-xs text-amber-700">Role change requested — awaiting approval.</p>}
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
    </form>
  );
}
