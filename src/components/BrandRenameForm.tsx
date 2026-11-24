"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBrand } from "@/app/(app)/brands/actions";
import { PencilSimple } from "@/components/icons";

export function BrandRenameForm({ brandId, name }: { brandId: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-stone-400 hover:text-brand-600" title="Rename">
        <PencilSimple size={14} aria-hidden="true" />
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            const result = await updateBrand(brandId, fd);
            if ("error" in result) {
              setError(result.error);
              return;
            }
            setEditing(false);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't rename this brand.");
          }
        });
      }}
      className="flex items-center gap-1"
    >
      <input className="input text-xs" name="name" defaultValue={name} required autoFocus />
      <button type="submit" disabled={isPending} className="btn-primary text-xs">
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-xs">
        Cancel
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
