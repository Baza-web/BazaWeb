"use server";

import { z } from "zod";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageBrands } from "@/lib/rbac";
import { initiateEdit } from "@/lib/editRequests";

const createSchema = z.object({ name: z.string().min(2).max(60) });

/** Owner's new brand goes live immediately; anyone else's is a pending request an Owner must approve first. */
export async function createBrand(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) throw new Error("Forbidden");

  const { name } = createSchema.parse({ name: String(formData.get("name") || "").trim() });

  const existing = await db.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) throw new Error("A brand with that name already exists.");

  const pendingSameName = await db.editRequest.findFirst({
    where: { entityType: "BRAND", status: "PENDING", proposedData: { path: ["name"], equals: name } },
  });
  if (pendingSameName) throw new Error(`A request to add "${name}" is already pending Owner review.`);

  await initiateEdit(session, "BRAND", crypto.randomUUID(), name, `New brand: ${name}`, { name, __create: true });
  revalidatePath("/brands");
  revalidatePath("/edit-requests");
}

/** Owner's rename applies immediately; anyone else's is a pending request an Owner must approve first. */
export async function updateBrand(brandId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) throw new Error("Forbidden");

  const { name } = createSchema.parse({ name: String(formData.get("name") || "").trim() });
  const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });

  const existing = await db.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" }, id: { not: brandId } } });
  if (existing) throw new Error(`A brand named "${name}" already exists.`);

  await initiateEdit(session, "BRAND", brandId, brand.name, `Renamed "${brand.name}" to "${name}"`, { name });
  revalidatePath("/brands");
  revalidatePath("/edit-requests");
}

/** Owner's change applies immediately; anyone else's is a pending request an Owner must approve first. Configurable per brand (Maison D'or today) rather than a hardcoded brand-name check — see Order dispatch gating in src/lib/qc.ts. */
export async function toggleRequiresGoldCertificates(brandId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) throw new Error("Forbidden");

  const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });
  await initiateEdit(
    session,
    "BRAND",
    brandId,
    brand.name,
    `${brand.requiresGoldCertificates ? "Disable" : "Enable"} gold certificate requirement for ${brand.name}`,
    { requiresGoldCertificates: !brand.requiresGoldCertificates },
  );
  revalidatePath("/brands");
  revalidatePath("/edit-requests");
}

/** Owner's status change applies immediately; anyone else's is a pending request an Owner must approve first. */
export async function toggleBrandActive(brandId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) throw new Error("Forbidden");

  const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });
  await initiateEdit(
    session,
    "BRAND",
    brandId,
    brand.name,
    `${brand.active ? "Deactivate" : "Activate"}: ${brand.name}`,
    { active: !brand.active },
  );
  revalidatePath("/brands");
  revalidatePath("/edit-requests");
}
