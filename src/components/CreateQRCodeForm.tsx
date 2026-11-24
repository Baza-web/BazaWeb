"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQRCode } from "@/app/(app)/qr/actions";
import { QRTargetPicker } from "@/components/QRTargetPicker";
import type { QRPickerOption } from "@/lib/qrTargets";

export function CreateQRCodeForm({
  products,
  gemstones,
  certificates,
  branches,
  tours,
}: {
  products: QRPickerOption[];
  gemstones: QRPickerOption[];
  certificates: QRPickerOption[];
  branches: QRPickerOption[];
  tours: QRPickerOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createQRCode(formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.push(`/qr/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't generate that QR code.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Label (internal — where is this going?)</label>
          <input className="input" name="label" placeholder="e.g. Front counter display — Ring #4521" required />
        </div>
        <QRTargetPicker products={products} gemstones={gemstones} certificates={certificates} branches={branches} tours={tours} />
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary text-sm disabled:opacity-50">
        {pending ? "Generating…" : "Generate QR code"}
      </button>
    </form>
  );
}
