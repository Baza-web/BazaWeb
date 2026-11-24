"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBrand } from "@/app/(app)/brands/actions";

export function DeleteBrandButton({ brandId, brandName }: { brandId: string; brandName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  function handleDelete() {
    if (!confirm(`Delete the brand "${brandName}"? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteBrand(brandId);
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
        setError(err instanceof Error ? err.message : "Couldn't delete this brand.");
      }
    });
  }

  if (requested) {
    return <span className="text-xs text-amber-700">Deletion requested</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="btn-secondary text-xs text-red-600 disabled:opacity-50"
      >
        Delete
      </button>
      {error && <p className="mt-1 w-48 text-xs text-red-700">{error}</p>}
    </div>
  );
}
