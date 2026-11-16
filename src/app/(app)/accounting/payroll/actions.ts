"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManagePayroll } from "@/lib/rbac";
import { calculatePayroll } from "@/lib/payroll";
import { round2 } from "@/lib/utils";
import { postExpenseJournalEntry } from "@/lib/ledger";

const periodSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});

async function requireRunInEditableState(runId: string) {
  const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "DRAFT") throw new Error("This payroll run has already been paid and can't be changed.");
  return run;
}

export async function generatePayrollRun(staffId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManagePayroll(session.role)) throw new Error("Forbidden");

  const { periodStart, periodEnd } = periodSchema.parse({
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
  });
  if (periodEnd < periodStart) throw new Error("The period end can't be before its start.");

  const staff = await db.staff.findFirst({ where: { id: staffId, deletedAt: null } });
  if (!staff) throw new Error("Staff member not found.");
  if (staff.baseSalary == null) {
    throw new Error(`${staff.name} doesn't have a base salary set yet — add one on their HR profile first.`);
  }
  if (!staff.branchId) throw new Error(`${staff.name} isn't assigned to a branch yet.`);

  const existing = await db.payrollRun.findFirst({ where: { staffId, periodStart, periodEnd } });
  if (existing) throw new Error(`${staff.name} already has a payroll run for this exact period.`);

  const metrics = await calculatePayroll(staffId, periodStart, periodEnd, staff.baseSalary, 0);

  await db.payrollRun.create({
    data: {
      staffId,
      branchId: staff.branchId,
      periodStart,
      periodEnd,
      baseSalary: staff.baseSalary,
      daysPresent: metrics.daysPresent,
      leaveDaysTaken: metrics.leaveDaysTaken,
      adjustment: 0,
      netPay: metrics.netPay,
      createdById: session.staffId,
    },
  });

  revalidatePath("/accounting/payroll");
}

export async function bulkGeneratePayroll(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManagePayroll(session.role)) throw new Error("Forbidden");

  const { periodStart, periodEnd } = periodSchema.parse({
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
  });
  if (periodEnd < periodStart) throw new Error("The period end can't be before its start.");

  const staff = await db.staff.findMany({
    where: { active: true, deletedAt: null, baseSalary: { not: null }, branchId: { not: null } },
  });

  const existingRuns = await db.payrollRun.findMany({
    where: { periodStart, periodEnd, staffId: { in: staff.map((s) => s.id) } },
    select: { staffId: true },
  });
  const alreadyDone = new Set(existingRuns.map((r) => r.staffId));

  for (const s of staff) {
    if (alreadyDone.has(s.id) || s.baseSalary == null || !s.branchId) continue;
    const metrics = await calculatePayroll(s.id, periodStart, periodEnd, s.baseSalary, 0);
    await db.payrollRun.create({
      data: {
        staffId: s.id,
        branchId: s.branchId,
        periodStart,
        periodEnd,
        baseSalary: s.baseSalary,
        daysPresent: metrics.daysPresent,
        leaveDaysTaken: metrics.leaveDaysTaken,
        adjustment: 0,
        netPay: metrics.netPay,
        createdById: session.staffId,
      },
    });
  }

  revalidatePath("/accounting/payroll");
}

const adjustmentSchema = z.object({
  adjustment: z.coerce.number(),
  adjustmentNote: z.string().optional(),
});

export async function updatePayrollAdjustment(runId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManagePayroll(session.role)) throw new Error("Forbidden");

  const run = await requireRunInEditableState(runId);
  const { adjustment, adjustmentNote } = adjustmentSchema.parse({
    adjustment: formData.get("adjustment") || 0,
    adjustmentNote: formData.get("adjustmentNote") || undefined,
  });

  const grossBeforeAdjustment = round2(run.netPay - run.adjustment);
  const netPay = round2(grossBeforeAdjustment + adjustment);

  await db.payrollRun.update({
    where: { id: runId },
    data: { adjustment, adjustmentNote, netPay },
  });

  revalidatePath("/accounting/payroll");
}

export async function deletePayrollRun(runId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManagePayroll(session.role)) throw new Error("Forbidden");
  await requireRunInEditableState(runId);
  await db.payrollRun.delete({ where: { id: runId } });
  revalidatePath("/accounting/payroll");
}

/** Pays a draft run: creates the Expense + Ledger entry that actually moves it through Accounting, then locks the run. */
export async function markPayrollPaid(runId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManagePayroll(session.role)) throw new Error("Forbidden");

  const run = await requireRunInEditableState(runId);
  const staff = await db.staff.findUniqueOrThrow({ where: { id: run.staffId } });

  await db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        branchId: run.branchId,
        category: "Payroll",
        description: `Payroll — ${staff.name} (${run.periodStart.toISOString().slice(0, 10)} to ${run.periodEnd.toISOString().slice(0, 10)})`,
        amount: run.netPay,
        date: new Date(),
        createdById: session.staffId,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        branchId: run.branchId,
        type: "EXPENSE",
        amount: run.netPay,
        description: expense.description,
        expenseId: expense.id,
      },
    });
    await postExpenseJournalEntry(
      session,
      { id: expense.id, category: "Payroll", description: expense.description, amount: run.netPay, branchId: run.branchId, date: expense.date },
      tx,
    );
    await tx.payrollRun.update({
      where: { id: runId },
      data: { status: "PAID", paidAt: new Date(), expenseId: expense.id },
    });
  });

  revalidatePath("/accounting/payroll");
  revalidatePath("/accounting");
}
