"use client";

import { useState, useTransition } from "react";
import { startCall } from "@/app/(app)/inbox/actions";
import { PhoneCall } from "./icons";

export function CallButton({ otherStaffId, otherName }: { otherStaffId: string; otherName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const { url } = await startCall(otherStaffId);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        setError("Couldn't start the call. Try again.");
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="btn-secondary text-xs"
        title={`Call ${otherName}`}
      >
        <PhoneCall size={15} aria-hidden="true" />
        {pending ? "Starting…" : "Call"}
      </button>
      {error && (
        <p className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700 shadow-card">
          {error}
        </p>
      )}
    </div>
  );
}
