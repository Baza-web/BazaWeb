"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function PushSubscribeButton() {
  const [status, setStatus] = useState<"idle" | "subscribing" | "subscribed" | "unsupported" | "error">(
    "idle",
  );

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      if (sub) setStatus("subscribed");
    });
  }, []);

  async function subscribe() {
    setStatus("subscribing");
    try {
      const keyRes = await fetch("/api/push/vapid-public-key");
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        setStatus("unsupported");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      setStatus("subscribed");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  if (status === "unsupported") {
    return <p className="text-sm text-stone-400">Push notifications aren&apos;t supported on this browser.</p>;
  }

  if (status === "subscribed") {
    return <p className="text-sm text-green-700">Push notifications are enabled on this device.</p>;
  }

  return (
    <button type="button" onClick={subscribe} disabled={status === "subscribing"} className="btn-secondary">
      {status === "subscribing" ? "Enabling…" : "Enable push notifications on this device"}
    </button>
  );
}
