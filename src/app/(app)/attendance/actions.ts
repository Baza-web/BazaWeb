"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
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
 * If the branch has a geofence configured, the coords are required and must
 * fall within geofenceRadiusM; otherwise coords are stored (if provided) but
 * not enforced.
 */
async function checkGeofence(branchId: string, coords: Coords): Promise<{ error?: string }> {
  const branch = await db.branch.findUniqueOrThrow({ where: { id: branchId } });
  if (branch.latitude == null || branch.longitude == null || branch.geofenceRadiusM == null) {
    return {};
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
