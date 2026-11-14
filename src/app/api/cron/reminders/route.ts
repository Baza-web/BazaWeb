import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notifications";

const REMINDER_DAYS_AHEAD = 3;

function sameMonthDay(date: Date, target: Date) {
  return date.getUTCMonth() === target.getUTCMonth() && date.getUTCDate() === target.getUTCDate();
}

/**
 * Triggered once a day by a cron job on the server (see DEPLOY.md). Looks
 * REMINDER_DAYS_AHEAD days ahead for any customer birthday or anniversary
 * and notifies that branch's Sales staff and Manager once.
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

  const target = new Date();
  target.setDate(target.getDate() + REMINDER_DAYS_AHEAD);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const customers = await db.customer.findMany({
    where: { OR: [{ birthday: { not: null } }, { anniversary: { not: null } }] },
  });

  let sent = 0;

  for (const customer of customers) {
    const occasions: string[] = [];
    if (customer.birthday && sameMonthDay(customer.birthday, target)) occasions.push("birthday");
    if (customer.anniversary && sameMonthDay(customer.anniversary, target)) occasions.push("anniversary");
    if (occasions.length === 0) continue;

    // Idempotency: skip if we've already notified about this customer today
    // (e.g. the cron job fired twice).
    const alreadySentToday = await db.notification.findFirst({
      where: {
        type: "CUSTOMER_OCCASION",
        link: `/customers/${customer.id}`,
        createdAt: { gte: todayStart },
      },
    });
    if (alreadySentToday) continue;

    const recipients = await db.staff.findMany({
      where: { branchId: customer.branchId, active: true, role: { in: ["SALES", "MANAGER"] } },
    });

    for (const occasion of occasions) {
      await Promise.all(
        recipients.map((staff) =>
          notifyStaff(
            staff.id,
            "CUSTOMER_OCCASION",
            `Upcoming ${occasion}`,
            `${customer.name}'s ${occasion} is in ${REMINDER_DAYS_AHEAD} days — consider reaching out.`,
            `/customers/${customer.id}`,
          ),
        ),
      );
      sent += recipients.length;
    }
  }

  return NextResponse.json({ ok: true, notificationsSent: sent });
}
