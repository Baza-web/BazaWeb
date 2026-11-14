"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function registerSubscription(subscription: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) throw new Error("Failed to register this device for push notifications.");
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
      if (!sub) return;
      try {
        // A subscription may already exist on this device from a previous
        // staff member who used it. Always re-register it for whoever is
        // signed in now, rather than assuming it already belongs to them.
        await registerSubscription(sub);
        setStatus("subscribed");
      } catch {
        setStatus("error");
      }
    });
  }, []);

  async function subscribe() {
    setStatus("subscribing");
    try {
      const keyRes = await fetch("/api/push/vapid-public-key");
      if (!keyRes.ok) {
        setStatus("unsupported");
        return;
      }
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        setStatus("unsupported");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await registerSubscription(subscription);
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
