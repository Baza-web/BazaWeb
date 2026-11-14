"use server";

import { revalidatePath } from "next/cache";
import { requireScopedSessionOrRedirect } from "@/lib/tenant-db";

export async function markAllNotificationsRead() {
  const { session, db } = await requireScopedSessionOrRedirect();
  await db.notification.updateMany({
    where: { staffId: session.staffId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}
