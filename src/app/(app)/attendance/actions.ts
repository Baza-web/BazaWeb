"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { notifyStaff } from "@/lib/notifications";
import { formatDateTime } from "@/lib/utils";

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

export async function clockIn(): Promise<{ error?: string }> {
  const session = await requireSessionOrRedirect();
  if (!session.branchId) return { error: "Your account has no branch assigned." };

  const open = await db.attendanceLog.findFirst({
    where: { staffId: session.staffId, clockOutAt: null },
  });
  if (open) return { error: "You're already clocked in." };

  const log = await db.attendanceLog.create({
    data: { staffId: session.staffId, branchId: session.branchId },
  });

  await notifySupervisors(session, `${session.name} clocked in at ${formatDateTime(log.clockInAt)}.`);
  revalidatePath("/attendance");
  return {};
}

export async function clockOut(): Promise<{ error?: string }> {
  const session = await requireSessionOrRedirect();

  const open = await db.attendanceLog.findFirst({
    where: { staffId: session.staffId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (!open) return { error: "You're not clocked in." };

  const now = new Date();
  await db.attendanceLog.update({ where: { id: open.id }, data: { clockOutAt: now } });

  await notifySupervisors(session, `${session.name} clocked out at ${formatDateTime(now)}.`);
  revalidatePath("/attendance");
  return {};
}
