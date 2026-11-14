"use client";

import { useTransition } from "react";
import { unsubscribeDevicePush } from "@/app/(app)/actions";
import { SignOut } from "./icons";

export function LogoutButton({ logoutAction }: { logoutAction: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          if (sub) {
            await unsubscribeDevicePush(sub.endpoint).catch(() => {});
            await sub.unsubscribe().catch(() => {});
          }
        }
      } finally {
        await logoutAction();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-stone-500 transition-colors hover:bg-stone-100 hover:text-red-700 disabled:opacity-50"
      title="Sign out"
    >
      <SignOut size={19} aria-hidden="true" />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}
