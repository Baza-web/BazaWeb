"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageQRCodes } from "@/lib/rbac";
import { generateQRCodeSlug, targetExists } from "@/lib/qr";

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

const targetTypeSchema = z.enum(["PRODUCT", "GEMSTONE", "CERTIFICATE", "BOUTIQUE", "TRAVEL_EXPERIENCE", "CAMPAIGN"]);

/**
 * Shared by create/update: validates the targetType/targetId/externalUrl combination a
 * form submitted, re-checking the target actually exists (not just that the client sent
 * *some* id) so a stale or tampered submission can't silently create a dead QR code.
 */
async function parseTarget(formData: FormData): Promise<{ error: string } | { targetType: z.infer<typeof targetTypeSchema>; targetId: string | null; externalUrl: string | null }> {
  const parsed = targetTypeSchema.safeParse(formData.get("targetType"));
  if (!parsed.success) return { error: "Choose what this QR code should point to." };
  const targetType = parsed.data;
  const targetId = emptyToUndefined(formData.get("targetId"));
  const externalUrl = emptyToUndefined(formData.get("externalUrl"));

  if (targetType === "CAMPAIGN") {
    if (!externalUrl) return { error: "A campaign QR needs a destination URL." };
    if (!z.string().url().safeParse(externalUrl).success) return { error: "That doesn't look like a valid URL." };
    return { targetType, targetId: null, externalUrl };
  }

  if (!targetId) return { error: "Choose what this QR code should point to." };
  if (!(await targetExists(targetType, targetId))) {
    return { error: "That no longer exists — pick another target." };
  }
  return { targetType, targetId, externalUrl: null };
}

export async function createQRCode(formData: FormData): Promise<{ error: string } | { id: string }> {
  const session = await requireSessionOrRedirect();
  if (!canManageQRCodes(session.role)) throw new Error("Forbidden");

  const label = z.string().min(1).safeParse(formData.get("label"));
  if (!label.success) return { error: "A label is required." };

  const target = await parseTarget(formData);
  if ("error" in target) return target;

  // Collision odds with an 8-char, 32-symbol alphabet are negligible, but a short retry
  // loop costs nothing and makes the @unique constraint purely a safety net, not a risk.
  let code = generateQRCodeSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.qRCode.findUnique({ where: { code } });
    if (!existing) break;
    code = generateQRCodeSlug();
  }

  const created = await db.qRCode.create({
    data: {
      code,
      label: label.data,
      targetType: target.targetType,
      targetId: target.targetId,
      externalUrl: target.externalUrl,
      createdById: session.staffId,
    },
  });

  revalidatePath("/qr");
  return { id: created.id };
}

export async function toggleQRCodeActive(qrCodeId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageQRCodes(session.role)) throw new Error("Forbidden");

  const qr = await db.qRCode.findUniqueOrThrow({ where: { id: qrCodeId } });
  await db.qRCode.update({ where: { id: qrCodeId }, data: { active: !qr.active } });
  revalidatePath("/qr");
  revalidatePath(`/qr/${qrCodeId}`);
}

export async function updateQRCodeTarget(qrCodeId: string, formData: FormData): Promise<{ error: string } | { ok: true }> {
  const session = await requireSessionOrRedirect();
  if (!canManageQRCodes(session.role)) throw new Error("Forbidden");

  const label = z.string().min(1).safeParse(formData.get("label"));
  if (!label.success) return { error: "A label is required." };

  const target = await parseTarget(formData);
  if ("error" in target) return target;

  await db.qRCode.update({
    where: { id: qrCodeId },
    data: {
      label: label.data,
      targetType: target.targetType,
      targetId: target.targetId,
      externalUrl: target.externalUrl,
    },
  });
  revalidatePath(`/qr/${qrCodeId}`);
  revalidatePath("/qr");
  return { ok: true };
}

export async function deleteQRCode(qrCodeId: string): Promise<{ error: string } | { ok: true }> {
  const session = await requireSessionOrRedirect();
  if (!canManageQRCodes(session.role)) throw new Error("Forbidden");
  await db.qRCode.delete({ where: { id: qrCodeId } });
  revalidatePath("/qr");
  return { ok: true };
}
