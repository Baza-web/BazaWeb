"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clockIn, clockOut } from "@/app/(app)/attendance/actions";
import { SignIn, SignOut } from "./icons";

export function ClockButton({ isClockedIn }: { isClockedIn: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = isClockedIn ? await clockOut() : await clockIn();
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        title={isClockedIn ? "Clock out" : "Clock in"}
        className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
          isClockedIn
            ? "text-green-700 hover:bg-green-50"
            : "text-stone-500 hover:bg-stone-100 hover:text-ink-900"
        }`}
      >
        {isClockedIn ? <SignOut size={19} aria-hidden="true" /> : <SignIn size={19} aria-hidden="true" />}
        <span className="hidden sm:inline">{isClockedIn ? "Clock out" : "Clock in"}</span>
      </button>
      {error && (
        <p className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700 shadow-card">
          {error}
        </p>
      )}
    </div>
  );
}
