"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";

export async function markAllNotificationsRead() {
  const session = await requireSessionOrRedirect();
  await db.notification.updateMany({
    where: { staffId: session.staffId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}
