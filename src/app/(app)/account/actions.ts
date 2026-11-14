"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect, hashPassword, verifyPassword } from "@/lib/auth";

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match",
    path: ["confirmPassword"],
  });

export async function changePassword(formData: FormData) {
  const session = await requireSessionOrRedirect();

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    redirect("/account?error=" + encodeURIComponent(parsed.error.issues[0].message));
  }

  const staff = await db.staff.findUniqueOrThrow({ where: { id: session.staffId } });
  const valid = await verifyPassword(parsed.data.currentPassword, staff.passwordHash);
  if (!valid) {
    redirect("/account?error=" + encodeURIComponent("Current password is incorrect."));
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.staff.update({ where: { id: session.staffId }, data: { passwordHash } });

  redirect("/account?success=1");
}
