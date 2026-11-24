"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateQRCodeTarget } from "@/app/(app)/qr/actions";
import { QRTargetPicker } from "@/components/QRTargetPicker";
import type { QRPickerOption } from "@/lib/qrTargets";

export function EditQRTargetForm({
  qrCodeId,
  label,
  targetType,
  targetId,
  externalUrl,
  products,
  gemstones,
  certificates,
  branches,
  tours,
}: {
  qrCodeId: string;
  label: string;
  targetType: string;
  targetId: string | null;
  externalUrl: string | null;
  products: QRPickerOption[];
  gemstones: QRPickerOption[];
  certificates: QRPickerOption[];
  branches: QRPickerOption[];
  tours: QRPickerOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await updateQRCodeTarget(qrCodeId, formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't update this QR code.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <input className="input" name="label" defaultValue={label} required />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QRTargetPicker
          products={products}
          gemstones={gemstones}
          certificates={certificates}
          branches={branches}
          tours={tours}
          defaultTargetType={targetType}
          defaultTargetId={targetId}
          defaultExternalUrl={externalUrl}
        />
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {saved && !error && <p className="text-xs text-emerald-700">Saved.</p>}
      <button type="submit" disabled={pending} className="btn-primary text-sm disabled:opacity-50">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
