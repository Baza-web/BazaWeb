"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSpecialProject } from "@/app/(app)/tasks/actions";

export function CreateSpecialProjectForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createSpecialProject(formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        formRef.current?.reset();
        router.push(`/tasks/project/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't create this project.");
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex gap-2">
      <input className="input" name="name" required placeholder="e.g. Showroom Opening" />
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Creating…" : "Create"}
      </button>
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
    </form>
  );
}
