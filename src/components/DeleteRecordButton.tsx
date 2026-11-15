"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DeleteAction = (formData: FormData) => Promise<{ status: "deleted" | "requested" }>;

export function DeleteRecordButton({
  action,
  label,
  confirmMessage,
  requestMessage,
  isOwner,
  redirectTo,
}: {
  action: DeleteAction;
  label: string;
  confirmMessage: string;
  requestMessage: string;
  isOwner: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  function handleDelete() {
    if (!confirm(isOwner ? confirmMessage : requestMessage)) return;

    setError(null);
    startTransition(async () => {
      try {
        const result = await action(new FormData());
        if (result.status === "requested") {
          setRequested(true);
        } else if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : `Couldn't delete this ${label.toLowerCase()}.`);
      }
    });
  }

  if (requested) {
    return <span className="text-xs text-amber-700">Deletion requested</span>;
  }

  return (
    <div>
      <button type="button" onClick={handleDelete} disabled={pending} className="text-xs text-red-600 hover:underline disabled:opacity-50">
        {isOwner ? "Delete" : "Request delete"}
      </button>
      {error && <p className="mt-1 w-48 text-xs text-red-700">{error}</p>}
    </div>
  );
}
