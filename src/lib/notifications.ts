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
  await db.notification.create({
    data: { staffId, type, title, body, link },
  });

  const subscriptions = await db.pushSubscription.findMany({ where: { staffId } });
  await Promise.all(
    subscriptions.map((sub) =>
      sendWebPush(sub, { title, body, link }),
    ),
  );
}
