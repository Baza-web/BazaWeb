"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canEditAttendance } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";
import { formatDateTime, distanceMeters } from "@/lib/utils";

async function notifySupervisors(session: { staffId: string; name: string; branchId: string | null }, message: string) {
  const supervisors = await db.staff.findMany({
    where: {
      active: true,
      OR: [{ branchId: session.branchId, role: "MANAGER" }, { role: { in: ["OWNER", "ADMIN"] } }],
    },
  });
  await Promise.all(
    supervisors
      .filter((s) => s.id !== session.staffId)
      .map((s) => notifyStaff(s.id, "ATTENDANCE", "Attendance update", message, "/attendance")),
  );
}

type Coords = { lat: number; lng: number } | null;

/**
 * Clocking in/out always requires being physically at the branch. If the
 * branch has no clock-in location set yet, that's a setup gap to fix on the
 * Branches page — not a reason to let someone clock in from anywhere.
 */
async function checkGeofence(branchId: string, coords: Coords): Promise<{ error?: string }> {
  const branch = await db.branch.findUniqueOrThrow({ where: { id: branchId } });
  if (branch.latitude == null || branch.longitude == null || branch.geofenceRadiusM == null) {
    return {
      error: `${branch.name} doesn't have a clock-in location set yet — ask an Owner/Admin to set one on the Branches page.`,
    };
  }
  if (!coords) {
    return { error: "This branch requires your location to clock in/out. Please allow location access and try again." };
  }
  const distance = distanceMeters(branch.latitude, branch.longitude, coords.lat, coords.lng);
  if (distance > branch.geofenceRadiusM) {
    return {
      error: `You're ${Math.round(distance)}m from ${branch.name} — you need to be within ${branch.geofenceRadiusM}m to clock in/out.`,
    };
  }
  return {};
}

export async function clockIn(coords: Coords): Promise<{ error?: string }> {
  const session = await requireSessionOrRedirect();
  if (session.role === "OWNER") return { error: "Owners don't clock in." };
  if (!session.branchId) return { error: "Your account has no branch assigned." };

  const open = await db.attendanceLog.findFirst({
    where: { staffId: session.staffId, clockOutAt: null },
  });
  if (open) return { error: "You're already clocked in." };

  const geofence = await checkGeofence(session.branchId, coords);
  if (geofence.error) return geofence;

  const log = await db.attendanceLog.create({
    data: {
      staffId: session.staffId,
      branchId: session.branchId,
      clockInLat: coords?.lat,
      clockInLng: coords?.lng,
    },
  });

  await notifySupervisors(session, `${session.name} clocked in at ${formatDateTime(log.clockInAt)}.`);
  revalidatePath("/attendance");
  return {};
}

export async function clockOut(coords: Coords): Promise<{ error?: string }> {
  const session = await requireSessionOrRedirect();
  if (session.role === "OWNER") return { error: "Owners don't clock in/out." };

  const open = await db.attendanceLog.findFirst({
    where: { staffId: session.staffId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (!open) return { error: "You're not clocked in." };

  const geofence = await checkGeofence(open.branchId, coords);
  if (geofence.error) return geofence;

  const now = new Date();
  await db.attendanceLog.update({
    where: { id: open.id },
    data: { clockOutAt: now, clockOutLat: coords?.lat, clockOutLng: coords?.lng },
  });

  await notifySupervisors(session, `${session.name} clocked out at ${formatDateTime(now)}.`);
  revalidatePath("/attendance");
  return {};
}

const editSchema = z.object({
  clockInAt: z.coerce.date(),
  clockOutAt: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.date().optional()),
});

/** Owner-only correction for a clock in/out record — e.g. a missed clock-out or a wrong time. */
export async function updateAttendanceLog(logId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canEditAttendance(session.role)) throw new Error("Forbidden");

  const parsed = editSchema.parse({
    clockInAt: formData.get("clockInAt"),
    clockOutAt: formData.get("clockOutAt"),
  });
  if (parsed.clockOutAt && parsed.clockOutAt < parsed.clockInAt) {
    throw new Error("Clock-out time can't be before clock-in time.");
  }

  const log = await db.attendanceLog.findUniqueOrThrow({ where: { id: logId }, include: { staff: true } });
  await db.attendanceLog.update({
    where: { id: logId },
    data: { clockInAt: parsed.clockInAt, clockOutAt: parsed.clockOutAt ?? null },
  });

  await notifyStaff(
    log.staffId,
    "ATTENDANCE",
    "Attendance record corrected",
    `${session.name} corrected your clock in/out record from ${formatDateTime(log.clockInAt)}.`,
    "/attendance",
  );
  revalidatePath("/attendance");
}

/** Owner-only — removes a mistaken record (e.g. an accidental double clock-in) entirely. */
export async function deleteAttendanceLog(logId: string) {
  const session = await requireSessionOrRedirect();
  if (!canEditAttendance(session.role)) throw new Error("Forbidden");

  await db.attendanceLog.delete({ where: { id: logId } });
  revalidatePath("/attendance");
}
