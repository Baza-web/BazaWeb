"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageSalesTargets, isCompanyWide } from "@/lib/rbac";

const schema = z
  .object({
    staffId: z.string().min(1),
    branchId: z.string().min(1),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    targetAmount: z.coerce.number().positive(),
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: "End date must be on or after the start date",
    path: ["periodEnd"],
  });

export async function createSalesTarget(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageSalesTargets(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const parsed = schema.parse({
    staffId: formData.get("staffId"),
    branchId,
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    targetAmount: formData.get("targetAmount"),
  });

  const staff = await db.staff.findUniqueOrThrow({ where: { id: parsed.staffId } });
  if (!isCompanyWide(session.role) && staff.branchId !== session.branchId) {
    throw new Error("Forbidden");
  }

  await db.salesTarget.create({ data: parsed });
  revalidatePath("/targets");
}

export async function deleteSalesTarget(targetId: string, _formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageSalesTargets(session.role)) throw new Error("Forbidden");

  const target = await db.salesTarget.findUniqueOrThrow({ where: { id: targetId } });
  if (!isCompanyWide(session.role) && target.branchId !== session.branchId) {
    throw new Error("Forbidden");
  }

  await db.salesTarget.delete({ where: { id: targetId } });
  revalidatePath("/targets");
}
