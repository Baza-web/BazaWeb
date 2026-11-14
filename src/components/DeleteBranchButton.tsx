"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBranch } from "@/app/(app)/branches/actions";

export function DeleteBranchButton({ branchId, branchName }: { branchId: string; branchName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Delete ${branchName}? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteBranch(branchId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete that branch.");
      }
    });
  }

  return (
    <div>
      <button type="button" onClick={handleDelete} disabled={pending} className="text-xs text-red-600 hover:underline disabled:opacity-50">
        Delete
      </button>
      {error && <p className="mt-1 w-48 text-xs text-red-700">{error}</p>}
    </div>
  );
}
