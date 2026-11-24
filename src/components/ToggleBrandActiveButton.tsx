"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleBrandActive } from "@/app/(app)/brands/actions";

export function ToggleBrandActiveButton({ brandId, active }: { brandId: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await toggleBrandActive(brandId);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't update this brand.");
      }
    });
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={pending} className="btn-secondary text-xs disabled:opacity-50">
        {active ? "Deactivate" : "Reactivate"}
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
