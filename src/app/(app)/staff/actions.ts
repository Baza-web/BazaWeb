"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect, hashPassword } from "@/lib/auth";
import { canManageStaffScoped, isCompanyWide, MANAGER_GRANTABLE_ROLES } from "@/lib/rbac";

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT", "CRAFTSMAN"]),
  branchId: z.string().min(1),
});

export async function createStaff(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.role)) throw new Error("Forbidden");

  const companyWide = isCompanyWide(session.role);
  const branchId = companyWide ? String(formData.get("branchId")) : session.branchId ?? "";

  const parsed = createSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
    role: formData.get("role"),
    branchId,
  });

  // A Branch Manager may only grant branch-level roles, for their own branch —
  // never a company-wide role (Owner/Admin/Accountant) and never another branch.
  if (!companyWide) {
    if (!MANAGER_GRANTABLE_ROLES.includes(parsed.role)) throw new Error("Forbidden");
    if (parsed.branchId !== session.branchId) throw new Error("Forbidden");
  }

  const passwordHash = await hashPassword(parsed.password);

  await db.staff.create({
    data: {
      name: parsed.name,
      email: parsed.email.toLowerCase(),
      phone: parsed.phone,
      role: parsed.role,
      branchId: parsed.branchId,
      passwordHash,
    },
  });

  redirect("/staff");
}

export async function toggleStaffActive(staffId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.role)) throw new Error("Forbidden");
  if (staffId === session.staffId) throw new Error("You can't deactivate your own account.");

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });

  if (!isCompanyWide(session.role)) {
    if (staff.branchId !== session.branchId) throw new Error("Forbidden");
    if (!MANAGER_GRANTABLE_ROLES.includes(staff.role)) throw new Error("Forbidden");
  }

  await db.staff.update({ where: { id: staffId }, data: { active: !staff.active } });
  revalidatePath("/staff");
}
