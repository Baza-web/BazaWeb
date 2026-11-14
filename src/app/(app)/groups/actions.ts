"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect, type SessionPayload } from "@/lib/auth";
import { canManageGroups, isCompanyWide } from "@/lib/rbac";

export async function createGroup(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageGroups(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const { name } = z.object({ name: z.string().min(2) }).parse({ name: formData.get("name") });

  await db.staffGroup.create({ data: { name, branchId } });
  revalidatePath("/groups");
}

async function assertGroupInScope(groupId: string, session: SessionPayload) {
  const group = await db.staffGroup.findUniqueOrThrow({ where: { id: groupId } });
  if (!isCompanyWide(session.role) && group.branchId !== session.branchId) {
    throw new Error("Forbidden");
  }
  return group;
}

export async function addGroupMember(groupId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageGroups(session.role)) throw new Error("Forbidden");

  const group = await assertGroupInScope(groupId, session);
  const staffId = String(formData.get("staffId"));
  if (!staffId) return;

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  if (staff.branchId !== group.branchId) throw new Error("Staff must belong to the group's branch.");

  await db.staffGroup.update({
    where: { id: groupId },
    data: { members: { connect: { id: staffId } } },
  });
  revalidatePath("/groups");
}

export async function removeGroupMember(groupId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageGroups(session.role)) throw new Error("Forbidden");

  await assertGroupInScope(groupId, session);
  const staffId = String(formData.get("staffId"));

  await db.staffGroup.update({
    where: { id: groupId },
    data: { members: { disconnect: { id: staffId } } },
  });
  revalidatePath("/groups");
}
