"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { notifyStaff } from "@/lib/notifications";

const schema = z.object({ body: z.string().min(1) });

export async function sendMessage(recipientId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const parsed = schema.parse({ body: formData.get("body") });

  await db.message.create({
    data: { senderId: session.staffId, recipientId, body: parsed.body },
  });

  await notifyStaff(
    recipientId,
    "NEW_MESSAGE",
    `New message from ${session.name}`,
    parsed.body.slice(0, 140),
    `/inbox/${session.staffId}`,
  );

  revalidatePath(`/inbox/${recipientId}`);
  revalidatePath("/inbox");
}

export async function markConversationRead(otherStaffId: string) {
  const session = await requireSessionOrRedirect();
  await db.message.updateMany({
    where: { senderId: otherStaffId, recipientId: session.staffId, readAt: null },
    data: { readAt: new Date() },
  });
}

/** Builds a shared video/voice call room (via the free Jitsi Meet service) for two staff. */
function callRoomUrl(staffIdA: string, staffIdB: string) {
  const roomId = [staffIdA, staffIdB].sort().join("-");
  return `https://meet.jit.si/BazaERP-${roomId}`;
}

export async function startCall(otherStaffId: string): Promise<{ url: string }> {
  const session = await requireSessionOrRedirect();
  const url = callRoomUrl(session.staffId, otherStaffId);

  await notifyStaff(
    otherStaffId,
    "CALL_INVITE",
    `${session.name} is calling you`,
    "Tap to join the call.",
    url,
  );

  return { url };
}
