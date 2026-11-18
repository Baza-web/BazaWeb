import "server-only";
import type { OrderStatus } from "@prisma/client";
import { db } from "./db";

export type AutoPriority = "OVERDUE" | "CRITICAL" | "HIGH" | "MEDIUM" | "NORMAL";

/** Orders in these statuses can never be "overdue" or "delayed" — the spec is explicit that completed/cancelled work doesn't carry urgency. */
export const CLOSED_ORDER_STATUSES: OrderStatus[] = ["COMPLETED", "CANCELLED"];

export type PrioritySettings = { criticalHours: number; highHours: number; mediumDays: number };

/** Owner/Admin-configurable urgency thresholds, stored as a singleton row (same pattern as GoogleDriveConnection) — created with the spec's defaults on first read. */
export async function getOrderPrioritySettings(): Promise<PrioritySettings> {
  const existing = await db.orderPrioritySettings.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;
  return db.orderPrioritySettings.create({ data: { id: "singleton" } });
}

/** Recalculated from the current deadline every time it's read — never stored, so it can't go stale. */
export function computeAutoPriority(
  currentDeadline: Date,
  status: OrderStatus,
  settings: PrioritySettings,
  now: Date = new Date(),
): AutoPriority | null {
  if (CLOSED_ORDER_STATUSES.includes(status)) return null;

  const msRemaining = currentDeadline.getTime() - now.getTime();
  if (msRemaining < 0) return "OVERDUE";

  const hoursRemaining = msRemaining / 3_600_000;
  if (hoursRemaining <= settings.criticalHours) return "CRITICAL";
  if (hoursRemaining <= settings.highHours) return "HIGH";

  const daysRemaining = msRemaining / 86_400_000;
  if (daysRemaining <= settings.mediumDays) return "MEDIUM";
  return "NORMAL";
}

export function daysRemaining(currentDeadline: Date, now: Date = new Date()) {
  return Math.ceil((currentDeadline.getTime() - now.getTime()) / 86_400_000);
}

export function daysOverdue(currentDeadline: Date, now: Date = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - currentDeadline.getTime()) / 86_400_000));
}

export const PRIORITY_STYLES: Record<AutoPriority, string> = {
  OVERDUE: "bg-red-600 text-white",
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-amber-100 text-amber-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  NORMAL: "bg-stone-100 text-stone-600",
};

export const PRIORITY_LABELS: Record<AutoPriority, string> = {
  OVERDUE: "Overdue",
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  NORMAL: "Normal",
};

/**
 * Prisma `where` fragments for each urgency bucket, built from indexed
 * `currentDeadline` + `status` columns rather than the computed value above —
 * so dashboard stat counts and board filters stay accurate and fast
 * regardless of how many orders exist, without ever loading every row.
 */
export function openOrderWhere() {
  return { status: { notIn: CLOSED_ORDER_STATUSES } };
}

export function overdueWhere(now: Date = new Date()) {
  return { ...openOrderWhere(), currentDeadline: { lt: now } };
}

export function dueWithinHoursWhere(hours: number, now: Date = new Date()) {
  return {
    ...openOrderWhere(),
    currentDeadline: { gte: now, lte: new Date(now.getTime() + hours * 3_600_000) },
  };
}

export function dueWithinDaysWhere(days: number, now: Date = new Date()) {
  return {
    ...openOrderWhere(),
    currentDeadline: { gte: now, lte: new Date(now.getTime() + days * 86_400_000) },
  };
}

export function criticalWhere(settings: PrioritySettings, now: Date = new Date()) {
  return dueWithinHoursWhere(settings.criticalHours, now);
}

export function highPriorityWhere(settings: PrioritySettings, now: Date = new Date()) {
  return {
    ...openOrderWhere(),
    currentDeadline: {
      gt: new Date(now.getTime() + settings.criticalHours * 3_600_000),
      lte: new Date(now.getTime() + settings.highHours * 3_600_000),
    },
  };
}
