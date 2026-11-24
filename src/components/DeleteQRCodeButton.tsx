"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteQRCode } from "@/app/(app)/qr/actions";
import { Trash } from "@/components/icons";

export function DeleteQRCodeButton({ qrCodeId, label }: { qrCodeId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Delete the QR code "${label}"? This can't be undone — the printed code will stop working.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteQRCode(qrCodeId);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.push("/qr");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete this QR code.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="flex items-center gap-1 text-sm text-red-600 hover:underline disabled:opacity-50"
      >
        <Trash size={14} /> Delete
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
