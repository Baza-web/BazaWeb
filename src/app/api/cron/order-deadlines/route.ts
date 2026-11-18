import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notifications";
import { getOrderPrioritySettings, overdueWhere, criticalWhere, highPriorityWhere } from "@/lib/orderPriority";

/**
 * Triggered periodically by a cron job on the server (see DEPLOY.md). Finds
 * orders that just became overdue/critical/high-priority and notifies the
 * assigned staff, plus Owner/Admin for overdue and critical orders — once
 * per order per bucket per day, so an order that stays overdue keeps
 * nudging daily rather than on every run, and never duplicates same-day
 * alerts. This exists so urgency surfaces without anyone needing to open
 * the Order Command Centre.
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

  const settings = await getOrderPrioritySettings();
  const now = new Date();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [overdueOrders, criticalOrders, highOrders] = await Promise.all([
    db.order.findMany({ where: overdueWhere(now), include: { primaryStaff: true, supportingStaff: true } }),
    db.order.findMany({ where: criticalWhere(settings, now), include: { primaryStaff: true, supportingStaff: true } }),
    db.order.findMany({ where: highPriorityWhere(settings, now), include: { primaryStaff: true, supportingStaff: true } }),
  ]);

  const owners = await db.staff.findMany({ where: { role: { in: ["OWNER", "ADMIN"] }, active: true } });

  let sent = 0;

  async function notifyOnce(staffId: string, orderId: string, title: string, body: string) {
    const link = `/orders/${orderId}`;
    const already = await db.notification.findFirst({
      where: { type: "ORDER_DEADLINE_ALERT", staffId, link, title, createdAt: { gte: todayStart } },
    });
    if (already) return;
    await notifyStaff(staffId, "ORDER_DEADLINE_ALERT", title, body, link);
    sent++;
  }

  for (const order of overdueOrders) {
    const assignees = new Set([order.primaryStaffId, ...order.supportingStaff.map((s) => s.id), ...owners.map((o) => o.id)]);
    for (const staffId of assignees) {
      await notifyOnce(staffId, order.id, "Order overdue", `${order.orderNumber}: ${order.productOrService} is overdue.`);
    }
  }

  for (const order of criticalOrders) {
    const assignees = new Set([order.primaryStaffId, ...order.supportingStaff.map((s) => s.id), ...owners.map((o) => o.id)]);
    for (const staffId of assignees) {
      await notifyOnce(staffId, order.id, "Order critical", `${order.orderNumber}: ${order.productOrService} is due within ${settings.criticalHours}h.`);
    }
  }

  for (const order of highOrders) {
    const assignees = new Set([order.primaryStaffId, ...order.supportingStaff.map((s) => s.id)]);
    for (const staffId of assignees) {
      await notifyOnce(staffId, order.id, "Order due soon", `${order.orderNumber}: ${order.productOrService} is due within ${settings.highHours}h.`);
    }
  }

  return NextResponse.json({ ok: true, notificationsSent: sent });
}
