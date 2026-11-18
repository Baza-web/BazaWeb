import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notifications";

/**
 * Triggered once a day by a cron job on the server (see DEPLOY.md). Finds
 * every open follow-up (CustomerNote.followUpAt in the past or today,
 * followUpDone still false) and notifies the staff member who set it —
 * once per note per day, so a follow-up left open keeps nudging until
 * someone marks it done or reopens/pushes it.
 */
export async function GET(request: Request) {
  const cronToken = process.env.CRON_TOKEN;
  if (!cronToken) {
    return NextResponse.json({ error: "CRON_TOKEN is not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("token") !== cronToken) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 403 });
  }

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const dueNotes = await db.customerNote.findMany({
    where: { followUpDone: false, followUpAt: { lte: todayEnd } },
    include: { customer: true },
  });

  let sent = 0;

  for (const note of dueNotes) {
    const alreadySentToday = await db.notification.findFirst({
      where: {
        type: "CUSTOMER_FOLLOWUP",
        link: `/customers/${note.customerId}`,
        staffId: note.staffId,
        createdAt: { gte: todayStart },
      },
    });
    if (alreadySentToday) continue;

    const overdueDays = note.followUpAt ? Math.floor((Date.now() - note.followUpAt.getTime()) / 86_400_000) : 0;
    const when = overdueDays > 0 ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue` : "due today";

    await notifyStaff(
      note.staffId,
      "CUSTOMER_FOLLOWUP",
      "Follow-up due",
      `Your follow-up with ${note.customer.name} is ${when} — ${note.body.slice(0, 80)}`,
      `/customers/${note.customerId}`,
    );
    sent++;
  }

  return NextResponse.json({ ok: true, notificationsSent: sent });
}
