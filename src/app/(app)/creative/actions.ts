"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canAccessCreativeHub, STAFF_MANAGER_ROLES } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";

const messageSchema = z.object({ body: z.string().min(1) });

export async function sendGroupMessage(groupId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canAccessCreativeHub(session.role)) throw new Error("Forbidden");

  const group = await db.staffGroup.findUniqueOrThrow({
    where: { id: groupId },
    include: { members: true },
  });

  const isMember = group.members.some((m) => m.id === session.staffId);
  if (!isMember && !STAFF_MANAGER_ROLES.includes(session.role)) throw new Error("Forbidden");

  const { body } = messageSchema.parse({ body: formData.get("body") });

  await db.groupMessage.create({
    data: { groupId, senderId: session.staffId, body },
  });

  const notifyIds = group.members.map((m) => m.id).filter((id) => id !== session.staffId);
  await Promise.all(
    notifyIds.map((staffId) =>
      notifyStaff(staffId, "NEW_MESSAGE", `${session.name} in ${group.name}`, body.slice(0, 140), "/creative"),
    ),
  );

  revalidatePath("/creative");
}
