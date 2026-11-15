import "server-only";
import { db } from "./db";
import { round2 } from "./utils";

function daysBetweenInclusive(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

async function countAttendanceDays(staffId: string, periodStart: Date, periodEnd: Date) {
  const logs = await db.attendanceLog.findMany({
    where: { staffId, clockInAt: { gte: periodStart, lte: periodEnd } },
    select: { clockInAt: true },
  });
  const uniqueDays = new Set(logs.map((l) => l.clockInAt.toISOString().slice(0, 10)));
  return uniqueDays.size;
}

async function countApprovedLeaveDays(staffId: string, periodStart: Date, periodEnd: Date) {
  const leaves = await db.leaveRequest.findMany({
    where: { staffId, status: "APPROVED", startDate: { lte: periodEnd }, endDate: { gte: periodStart } },
  });
  let days = 0;
  for (const leave of leaves) {
    const start = leave.startDate < periodStart ? periodStart : leave.startDate;
    const end = leave.endDate > periodEnd ? periodEnd : leave.endDate;
    days += Math.max(daysBetweenInclusive(start, end), 0);
  }
  return days;
}

/**
 * Pulls real attendance + approved leave for the period and turns them into
 * a payroll figure: approved leave is paid in full, any other day the
 * person neither clocked in nor had leave for is deducted pro-rata from
 * their base salary. `adjustment` (bonus or deduction, positive or negative)
 * is applied on top.
 */
export async function calculatePayroll(
  staffId: string,
  periodStart: Date,
  periodEnd: Date,
  baseSalary: number,
  adjustment: number,
) {
  const [daysPresent, leaveDaysTaken] = await Promise.all([
    countAttendanceDays(staffId, periodStart, periodEnd),
    countApprovedLeaveDays(staffId, periodStart, periodEnd),
  ]);
  const totalDays = daysBetweenInclusive(periodStart, periodEnd);
  const perDayRate = totalDays > 0 ? baseSalary / totalDays : 0;
  const unpaidAbsentDays = Math.max(totalDays - daysPresent - leaveDaysTaken, 0);
  const deduction = round2(perDayRate * unpaidAbsentDays);
  const netPay = round2(baseSalary - deduction + adjustment);
  return { daysPresent, leaveDaysTaken, totalDays, unpaidAbsentDays, deduction, netPay };
}
