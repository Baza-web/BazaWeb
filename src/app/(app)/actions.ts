"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSessionCookie, requireSessionOrRedirect } from "@/lib/auth";
import { canEditNavOrder } from "@/lib/rbac";
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

/**
 * Saves the sidebar's drag-and-drop order as a list of hrefs — company-wide,
 * not per-user, since only Owner/Admin may change it (matches the nav
 * edit-mode gate in AppShell, but this is the authoritative check: the
 * client-side gate is just UX, not security).
 */
export async function updateNavOrder(order: string[]) {
  const session = await requireSessionOrRedirect();
  if (!canEditNavOrder(session.role)) throw new Error("Forbidden");

  if (!Array.isArray(order) || order.some((href) => typeof href !== "string")) {
    throw new Error("Invalid order.");
  }

  await db.navSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", order },
    update: { order },
  });

  revalidatePath("/", "layout");
}
