import "server-only";
import { db } from "./db";
import { sendWebPush } from "./push";
import type { NotificationType } from "@prisma/client";

export async function notifyStaff(
  staffId: string,
  type: NotificationType,
  title: string,
  body: string,
  link?: string,
) {
  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId }, select: { organizationId: true } });

  await db.notification.create({
    data: { staffId, type, title, body, link, organizationId: staff.organizationId },
  });

  const subscriptions = await db.pushSubscription.findMany({ where: { staffId } });
  await Promise.all(
    subscriptions.map((sub) =>
      sendWebPush(sub, { title, body, link }),
    ),
  );
}
