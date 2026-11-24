"use server";

import { z } from "zod";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageBrands } from "@/lib/rbac";
import { initiateEdit } from "@/lib/editRequests";
import { initiateDeletion } from "@/lib/deletion";

const createSchema = z.object({ name: z.string().min(2).max(60) });

type ActionResult = { error: string } | { status: "applied" | "requested" };

/** Owner's new brand goes live immediately; Admin's does too; anyone else's would be a pending request an Owner must approve first (in practice only Owner/Admin can reach this page at all). */
export async function createBrand(formData: FormData): Promise<ActionResult> {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) throw new Error("Forbidden");

  const parsed = createSchema.safeParse({ name: String(formData.get("name") || "").trim() });
  if (!parsed.success) return { error: "Enter a brand name (at least 2 characters)." };
  const { name } = parsed.data;

  const existing = await db.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) return { error: "A brand with that name already exists." };

  const pendingSameName = await db.editRequest.findFirst({
    where: { entityType: "BRAND", status: "PENDING", proposedData: { path: ["name"], equals: name } },
  });
  if (pendingSameName) return { error: `A request to add "${name}" is already pending review.` };

  const result = await initiateEdit(session, "BRAND", crypto.randomUUID(), name, `New brand: ${name}`, { name, __create: true });
  revalidatePath("/brands");
  revalidatePath("/edit-requests");
  return result;
}

/** Owner's and Admin's renames apply immediately; anyone else's is a pending request an Owner must approve first. */
export async function updateBrand(brandId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) throw new Error("Forbidden");

  const parsed = createSchema.safeParse({ name: String(formData.get("name") || "").trim() });
  if (!parsed.success) return { error: "Enter a brand name (at least 2 characters)." };
  const { name } = parsed.data;
  const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });

  const existing = await db.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" }, id: { not: brandId } } });
  if (existing) return { error: `A brand named "${name}" already exists.` };

  const result = await initiateEdit(session, "BRAND", brandId, brand.name, `Renamed "${brand.name}" to "${name}"`, { name });
  revalidatePath("/brands");
  revalidatePath("/edit-requests");
  return result;
}

/** Owner's and Admin's change applies immediately; anyone else's is a pending request an Owner must approve first. Configurable per brand (Maison D'or today) rather than a hardcoded brand-name check — see Order dispatch gating in src/lib/qc.ts. */
export async function toggleRequiresGoldCertificates(brandId: string): Promise<ActionResult> {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) throw new Error("Forbidden");

  const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });
  const result = await initiateEdit(
    session,
    "BRAND",
    brandId,
    brand.name,
    `${brand.requiresGoldCertificates ? "Disable" : "Enable"} gold certificate requirement for ${brand.name}`,
    { requiresGoldCertificates: !brand.requiresGoldCertificates },
  );
  revalidatePath("/brands");
  revalidatePath("/edit-requests");
  return result;
}

/** Owner's and Admin's status change applies immediately; anyone else's is a pending request an Owner must approve first. */
export async function toggleBrandActive(brandId: string): Promise<ActionResult> {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) throw new Error("Forbidden");

  const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });
  const result = await initiateEdit(
    session,
    "BRAND",
    brandId,
    brand.name,
    `${brand.active ? "Deactivate" : "Activate"}: ${brand.name}`,
    { active: !brand.active },
  );
  revalidatePath("/brands");
  revalidatePath("/edit-requests");
  return result;
}

/** Owner and Admin delete immediately; refuses if the brand is still in use anywhere (see performBrandDeletion in src/lib/deletion.ts). */
export async function deleteBrand(brandId: string): Promise<{ error: string } | { status: "deleted" | "requested" }> {
  const session = await requireSessionOrRedirect();
  if (!canManageBrands(session.role)) throw new Error("Forbidden");

  const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });
  try {
    const result = await initiateDeletion(session, "BRAND", brandId, brand.name);
    revalidatePath("/brands");
    revalidatePath("/deletion-requests");
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't delete this brand." };
  }
}
