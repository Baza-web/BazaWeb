"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageQRCodes } from "@/lib/rbac";
import { generateQRCodeSlug } from "@/lib/qr";

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

const targetTypeSchema = z.enum(["PRODUCT", "GEMSTONE", "CERTIFICATE", "BOUTIQUE", "TRAVEL_EXPERIENCE", "CAMPAIGN"]);

export async function createQRCode(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageQRCodes(session.role)) throw new Error("Forbidden");

  const targetType = targetTypeSchema.parse(formData.get("targetType"));
  const targetId = emptyToUndefined(formData.get("targetId"));
  const externalUrl = emptyToUndefined(formData.get("externalUrl"));

  if (targetType === "CAMPAIGN" && !externalUrl) {
    throw new Error("A campaign QR needs a destination URL.");
  }
  if (targetType !== "CAMPAIGN" && !targetId) {
    throw new Error("Choose what this QR code should point to.");
  }

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
      label: z.string().min(1, "A label is required.").parse(formData.get("label")),
      targetType,
      targetId: targetType === "CAMPAIGN" ? null : targetId,
      externalUrl: targetType === "CAMPAIGN" ? externalUrl : null,
      createdById: session.staffId,
    },
  });

  revalidatePath("/qr");
  return created.id;
}

export async function toggleQRCodeActive(qrCodeId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageQRCodes(session.role)) throw new Error("Forbidden");

  const qr = await db.qRCode.findUniqueOrThrow({ where: { id: qrCodeId } });
  await db.qRCode.update({ where: { id: qrCodeId }, data: { active: !qr.active } });
  revalidatePath("/qr");
  revalidatePath(`/qr/${qrCodeId}`);
}

export async function updateQRCodeTarget(qrCodeId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageQRCodes(session.role)) throw new Error("Forbidden");

  const targetType = targetTypeSchema.parse(formData.get("targetType"));
  const targetId = emptyToUndefined(formData.get("targetId"));
  const externalUrl = emptyToUndefined(formData.get("externalUrl"));

  if (targetType === "CAMPAIGN" && !externalUrl) {
    throw new Error("A campaign QR needs a destination URL.");
  }
  if (targetType !== "CAMPAIGN" && !targetId) {
    throw new Error("Choose what this QR code should point to.");
  }

  await db.qRCode.update({
    where: { id: qrCodeId },
    data: {
      label: z.string().min(1).parse(formData.get("label")),
      targetType,
      targetId: targetType === "CAMPAIGN" ? null : targetId,
      externalUrl: targetType === "CAMPAIGN" ? externalUrl : null,
    },
  });
  revalidatePath(`/qr/${qrCodeId}`);
}

export async function deleteQRCode(qrCodeId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageQRCodes(session.role)) throw new Error("Forbidden");
  await db.qRCode.delete({ where: { id: qrCodeId } });
  revalidatePath("/qr");
}
