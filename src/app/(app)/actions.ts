"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, requireSessionOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}

/**
 * Revokes this device's push subscription before logout, so a shared
 * device doesn't keep delivering the previous staff member's private
 * notification previews to whoever uses it next.
 */
export async function unsubscribeDevicePush(endpoint: string) {
  const session = await requireSessionOrRedirect();
  await db.pushSubscription.deleteMany({
    where: { endpoint, staffId: session.staffId },
  });
}
