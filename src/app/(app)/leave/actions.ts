"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canReviewLeave, canManageStaffScoped, isCompanyWide } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";

const createSchema = z
  .object({
    type: z.enum(["SICK", "VACATION", "PERSONAL", "OTHER"]),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export async function createLeaveRequest(formData: FormData) {
  const session = await requireSessionOrRedirect();

  const parsed = createSchema.parse({
    type: formData.get("type"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: formData.get("reason") || undefined,
  });

  await db.leaveRequest.create({
    data: { ...parsed, staffId: session.staffId },
  });

  const reviewers = await db.staff.findMany({
    where: {
      active: true,
      OR: [{ branchId: session.branchId, role: "MANAGER" }, { role: { in: ["OWNER", "ADMIN"] } }],
    },
  });
  await Promise.all(
    reviewers
      .filter((r) => r.id !== session.staffId)
      .map((r) =>
        notifyStaff(
          r.id,
          "LEAVE_REQUESTED",
          "New leave request",
          `${session.name} requested ${parsed.type.toLowerCase()} leave.`,
          "/leave",
        ),
      ),
  );

  revalidatePath("/leave");
}

const entitlementSchema = z.object({
  type: z.enum(["SICK", "VACATION", "PERSONAL", "OTHER"]),
  year: z.coerce.number().int().min(2020),
  daysAllotted: z.coerce.number().min(0),
});

export async function setLeaveEntitlement(staffId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.role)) throw new Error("Forbidden");

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  if (!isCompanyWide(session.role) && staff.branchId !== session.branchId) throw new Error("Forbidden");

  const parsed = entitlementSchema.parse({
    type: formData.get("type"),
    year: formData.get("year"),
    daysAllotted: formData.get("daysAllotted"),
  });

  await db.leaveEntitlement.upsert({
    where: { staffId_type_year: { staffId, type: parsed.type, year: parsed.year } },
    create: { staffId, ...parsed },
    update: { daysAllotted: parsed.daysAllotted },
  });

  revalidatePath(`/staff/${staffId}`);
}

const decisionSchema = z.enum(["APPROVED", "REJECTED"]);

export async function reviewLeaveRequest(requestId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canReviewLeave(session.role)) throw new Error("Forbidden");

  const decision = decisionSchema.parse(formData.get("decision"));

  const request = await db.leaveRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { staff: true },
  });

  if (!isCompanyWide(session.role) && request.staff.branchId !== session.branchId) {
    throw new Error("Forbidden");
  }

  await db.leaveRequest.update({
    where: { id: requestId },
    data: { status: decision, reviewedById: session.staffId, reviewedAt: new Date() },
  });

  await notifyStaff(
    request.staffId,
    "LEAVE_DECIDED",
    `Leave request ${decision.toLowerCase()}`,
    `${session.name} ${decision === "APPROVED" ? "approved" : "rejected"} your ${request.type.toLowerCase()} leave request.`,
    "/leave",
  );

  revalidatePath("/leave");
}
