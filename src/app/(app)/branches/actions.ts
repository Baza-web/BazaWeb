"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageStaff } from "@/lib/rbac";

const schema = z.object({
  name: z.string().min(2),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export async function createBranch(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.role)) throw new Error("Forbidden");

  const parsed = schema.parse({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
  });

  await db.branch.create({ data: parsed });
  revalidatePath("/branches");
}
