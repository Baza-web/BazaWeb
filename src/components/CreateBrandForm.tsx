"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrand } from "@/app/(app)/brands/actions";

export function CreateBrandForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setRequested(false);
    startTransition(async () => {
      try {
        const result = await createBrand(formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        formRef.current?.reset();
        if (result.status === "requested") {
          setRequested(true);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add this brand.");
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex gap-2">
      <input className="input" name="name" required placeholder="New brand name" />
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Adding…" : "Add"}
      </button>
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
      {requested && <p className="w-full text-xs text-amber-700">Submitted — awaiting Owner approval.</p>}
    </form>
  );
}
