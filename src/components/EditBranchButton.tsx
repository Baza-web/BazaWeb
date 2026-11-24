"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBranchDetails } from "@/app/(app)/branches/actions";

export function EditBranchButton({
  branchId,
  name,
  address,
  phone,
}: {
  branchId: string;
  name: string;
  address: string | null;
  phone: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateBranchDetails(branchId, formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save that branch.");
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand-700 hover:underline">
        Edit
      </button>
    );
  }

  return (
    <form action={handleSave} className="w-56 space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div>
        <label className="label text-xs">Name</label>
        <input className="input text-xs" name="name" defaultValue={name} required minLength={2} />
      </div>
      <div>
        <label className="label text-xs">Address</label>
        <input className="input text-xs" name="address" defaultValue={address ?? ""} />
      </div>
      <div>
        <label className="label text-xs">Phone</label>
        <input className="input text-xs" name="phone" defaultValue={phone ?? ""} />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn-primary text-xs disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-xs text-stone-500 hover:underline"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  );
}
