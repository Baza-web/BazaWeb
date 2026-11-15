"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageBrands } from "@/lib/rbac";

const createSchema = z.object({ name: z.string().min(2).max(60) });

export async function createBrand(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) throw new Error("Forbidden");

  const { name } = createSchema.parse({ name: String(formData.get("name") || "").trim() });

  const existing = await db.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) throw new Error("A brand with that name already exists.");

  await db.brand.create({ data: { name } });
  revalidatePath("/brands");
}

export async function toggleBrandActive(brandId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) throw new Error("Forbidden");

  const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });
  await db.brand.update({ where: { id: brandId }, data: { active: !brand.active } });
  revalidatePath("/brands");
}
