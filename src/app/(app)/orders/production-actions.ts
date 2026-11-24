"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { isCompanyWide, canManageOrdersScoped, canPerformQCInspection, canEditQCChecklistTemplate, canVerifyGoldCertificates } from "@/lib/rbac";
import { requireIndependentInspector } from "@/lib/qc";
import { saveUploadedImages } from "@/lib/uploads";
import type { MetalType, QCDecision } from "@prisma/client";

/**
 * Same order-access rule as the rest of Orders Handling (see orders/actions.ts's
 * requireOrderAccess), broadened to also admit a QC-eligible role (e.g. Craftsman)
 * who is NOT assigned — that's the whole point of an independent inspection, and
 * the same production-floor staff also record BOM/handover data on orders they
 * pick up rather than only ones they were originally assigned. Still restricted
 * to their own branch unless company-wide.
 */
async function requireOrderAccess(orderId: string, session: Awaited<ReturnType<typeof requireSessionOrRedirect>>) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { supportingStaff: true, brand: true } });
  const isAssigned = order.primaryStaffId === session.staffId || order.supportingStaff.some((s) => s.id === session.staffId);
  const canManage = canManageOrdersScoped(session.role);
  if (!canManage && !isAssigned && !canPerformQCInspection(session.role)) throw new Error("Forbidden");
  if (!isCompanyWide(session.role) && order.branchId && order.branchId !== session.branchId) throw new Error("Forbidden");
  return { order, isAssigned, canManage };
}

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function numOrUndef(value: FormDataEntryValue | null) {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// --- Metal specs ---

export async function addOrderMetalSpec(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  await requireOrderAccess(orderId, session);

  const metalType = z.enum(["GOLD", "SILVER", "PALLADIUM", "OTHER"]).parse(formData.get("metalType")) as MetalType;
  await db.orderMetalSpec.create({
    data: {
      orderId,
      metalType,
      purity: emptyToUndefined(formData.get("purity")),
      estimatedWeightGrams: numOrUndef(formData.get("estimatedWeightGrams")),
      actualWeightGrams: numOrUndef(formData.get("actualWeightGrams")),
      wastageGrams: numOrUndef(formData.get("wastageGrams")),
      scrapRecoveredGrams: numOrUndef(formData.get("scrapRecoveredGrams")),
      notes: emptyToUndefined(formData.get("notes")),
    },
  });
  revalidatePath(`/orders/${orderId}`);
}

export async function updateOrderMetalSpec(specId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const spec = await db.orderMetalSpec.findUniqueOrThrow({ where: { id: specId } });
  await requireOrderAccess(spec.orderId, session);

  await db.orderMetalSpec.update({
    where: { id: specId },
    data: {
      purity: emptyToUndefined(formData.get("purity")),
      estimatedWeightGrams: numOrUndef(formData.get("estimatedWeightGrams")),
      actualWeightGrams: numOrUndef(formData.get("actualWeightGrams")),
      wastageGrams: numOrUndef(formData.get("wastageGrams")),
      scrapRecoveredGrams: numOrUndef(formData.get("scrapRecoveredGrams")),
      notes: emptyToUndefined(formData.get("notes")),
    },
  });
  revalidatePath(`/orders/${spec.orderId}`);
}

export async function deleteOrderMetalSpec(specId: string) {
  const session = await requireSessionOrRedirect();
  const spec = await db.orderMetalSpec.findUniqueOrThrow({ where: { id: specId } });
  await requireOrderAccess(spec.orderId, session);
  await db.orderMetalSpec.delete({ where: { id: specId } });
  revalidatePath(`/orders/${spec.orderId}`);
}

// --- Gemstone specs ---

export async function addOrderGemstoneSpec(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  await requireOrderAccess(orderId, session);

  const photoFiles = formData.getAll("photos").filter((f) => f instanceof File) as File[];
  const photos = await saveUploadedImages(photoFiles, "gemstones");

  await db.orderGemstoneSpec.create({
    data: {
      orderId,
      gemstoneType: z.string().min(1, "Gemstone type is required.").parse(formData.get("gemstoneType")),
      caratWeight: numOrUndef(formData.get("caratWeight")),
      dimensions: emptyToUndefined(formData.get("dimensions")),
      cut: emptyToUndefined(formData.get("cut")),
      color: emptyToUndefined(formData.get("color")),
      clarity: emptyToUndefined(formData.get("clarity")),
      origin: emptyToUndefined(formData.get("origin")),
      treatment: emptyToUndefined(formData.get("treatment")),
      certificateNumber: emptyToUndefined(formData.get("certificateNumber")),
      supplierId: emptyToUndefined(formData.get("supplierId")),
      photos,
      notes: emptyToUndefined(formData.get("notes")),
    },
  });
  revalidatePath(`/orders/${orderId}`);
}

export async function updateOrderGemstoneSpec(specId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const spec = await db.orderGemstoneSpec.findUniqueOrThrow({ where: { id: specId } });
  await requireOrderAccess(spec.orderId, session);

  await db.orderGemstoneSpec.update({
    where: { id: specId },
    data: {
      caratWeight: numOrUndef(formData.get("caratWeight")),
      dimensions: emptyToUndefined(formData.get("dimensions")),
      cut: emptyToUndefined(formData.get("cut")),
      color: emptyToUndefined(formData.get("color")),
      clarity: emptyToUndefined(formData.get("clarity")),
      origin: emptyToUndefined(formData.get("origin")),
      treatment: emptyToUndefined(formData.get("treatment")),
      certificateNumber: emptyToUndefined(formData.get("certificateNumber")),
      verified: formData.get("verified") === "on",
      notes: emptyToUndefined(formData.get("notes")),
    },
  });
  revalidatePath(`/orders/${spec.orderId}`);
}

export async function deleteOrderGemstoneSpec(specId: string) {
  const session = await requireSessionOrRedirect();
  const spec = await db.orderGemstoneSpec.findUniqueOrThrow({ where: { id: specId } });
  await requireOrderAccess(spec.orderId, session);
  await db.orderGemstoneSpec.delete({ where: { id: specId } });
  revalidatePath(`/orders/${spec.orderId}`);
}

// --- Components (findings/packaging) ---

export async function addOrderComponent(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  await requireOrderAccess(orderId, session);

  await db.orderComponent.create({
    data: {
      orderId,
      name: z.string().min(1).parse(formData.get("name")),
      estimatedQty: numOrUndef(formData.get("estimatedQty")),
      actualQty: numOrUndef(formData.get("actualQty")),
      unit: emptyToUndefined(formData.get("unit")),
      notes: emptyToUndefined(formData.get("notes")),
    },
  });
  revalidatePath(`/orders/${orderId}`);
}

export async function deleteOrderComponent(componentId: string) {
  const session = await requireSessionOrRedirect();
  const component = await db.orderComponent.findUniqueOrThrow({ where: { id: componentId } });
  await requireOrderAccess(component.orderId, session);
  await db.orderComponent.delete({ where: { id: componentId } });
  revalidatePath(`/orders/${component.orderId}`);
}

// --- QC checklist template (Owner/Admin configurable) ---

export async function addQCChecklistTemplateItem(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canEditQCChecklistTemplate(session.role)) throw new Error("Forbidden");

  const label = z.string().min(1).parse(formData.get("label"));
  const count = await db.qCChecklistTemplate.count();
  await db.qCChecklistTemplate.create({ data: { label, sortOrder: count } });
  revalidatePath("/orders/qc-settings");
}

export async function deactivateQCChecklistTemplateItem(templateId: string) {
  const session = await requireSessionOrRedirect();
  if (!canEditQCChecklistTemplate(session.role)) throw new Error("Forbidden");
  await db.qCChecklistTemplate.update({ where: { id: templateId }, data: { active: false } });
  revalidatePath("/orders/qc-settings");
}

const DEFAULT_QC_CHECKLIST = [
  "Design accuracy", "Metal purity verification", "Weight verification", "Gemstone verification",
  "Stone setting", "Prong security", "Dimensions", "Finishing", "Polishing", "Surface defects",
  "Engraving", "Product appearance", "Certificate verification", "Packaging",
];

/** One-click starting point from the spec's own suggested checklist — editable afterward, never re-applied silently. */
export async function seedDefaultQCChecklist() {
  const session = await requireSessionOrRedirect();
  if (!canEditQCChecklistTemplate(session.role)) throw new Error("Forbidden");
  const existing = await db.qCChecklistTemplate.count();
  if (existing > 0) return;
  await db.qCChecklistTemplate.createMany({
    data: DEFAULT_QC_CHECKLIST.map((label, i) => ({ label, sortOrder: i })),
  });
  revalidatePath("/orders/qc-settings");
}

// --- QC inspection ---

const qcResultSchema = z.object({
  templateId: z.string().optional(),
  label: z.string().min(1),
  result: z.enum(["PASS", "FAIL", "NA"]),
  comment: z.string().optional(),
});

/**
 * Submits one full inspection (every checklist item at once) and, on FAIL,
 * returns the order to rework — the failed inspection itself is never
 * edited or deleted, only superseded by a fresh one after rework.
 */
export async function submitQCInspection(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canPerformQCInspection(session.role)) throw new Error("Forbidden");
  const { order } = await requireOrderAccess(orderId, session);
  requireIndependentInspector(order, session.staffId);

  const resultsJson = z.string().parse(formData.get("resultsJson"));
  const parsedResults = z.array(qcResultSchema).min(1, "At least one checklist item is required.").parse(JSON.parse(resultsJson));
  const generalNotes = formData.get("generalNotes") ? String(formData.get("generalNotes")) : undefined;

  const anyFail = parsedResults.some((r) => r.result === "FAIL");
  const decision: QCDecision = anyFail ? "FAIL" : "PASS";

  await db.$transaction(async (tx) => {
    await tx.qCInspection.create({
      data: {
        orderId,
        inspectorId: session.staffId,
        decision,
        generalNotes,
        results: {
          create: parsedResults.map((r) => ({
            templateId: r.templateId || undefined,
            label: r.label,
            result: r.result,
            comment: r.comment || undefined,
          })),
        },
      },
    });

    if (decision === "FAIL") {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "REVISION_REQUIRED",
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: "REVISION_REQUIRED",
              reason: "QC inspection failed — returned for rework",
              changedById: session.staffId,
            },
          },
        },
      });
    }
  });

  const notifyTargets = new Set([order.primaryStaffId, order.createdById]);
  const { notifyStaff } = await import("@/lib/notifications");
  await Promise.all(
    Array.from(notifyTargets)
      .filter((id) => id !== session.staffId)
      .map((id) =>
        notifyStaff(
          id,
          decision === "FAIL" ? "ORDER_STATUS_CHANGED" : "ORDER_STATUS_CHANGED",
          decision === "FAIL" ? "QC failed — rework needed" : "QC passed",
          `${order.orderNumber}: ${decision === "FAIL" ? "QC inspection failed, returned for rework." : "QC inspection passed."}`,
          `/orders/${orderId}`,
        ),
      ),
  );

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders/all");
}

// --- Gold certificates ---

export async function addGoldCertificate(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const { order } = await requireOrderAccess(orderId, session);

  const documentFiles = formData.getAll("document").filter((f) => f instanceof File) as File[];
  const documents = await saveUploadedImages(documentFiles, "gold-certificates", true);

  const certificateNumber = z.string().min(1).parse(formData.get("certificateNumber"));
  await db.goldCertificate.create({
    data: {
      orderId,
      certificateNumber,
      issuingAuthority: emptyToUndefined(formData.get("issuingAuthority")),
      goldSpecification: emptyToUndefined(formData.get("goldSpecification")),
      documentUrl: documents[0],
      notes: emptyToUndefined(formData.get("notes")),
    },
  });

  const { notifyStaff } = await import("@/lib/notifications");
  const reviewers = await db.staff.findMany({ where: { active: true, role: { in: ["OWNER", "ADMIN"] } } });
  await Promise.all(
    reviewers
      .filter((r) => r.id !== session.staffId)
      .map((r) =>
        notifyStaff(r.id, "SYSTEM", "Gold certificate needs review", `${order.orderNumber}: certificate #${certificateNumber} was added and needs verification.`, `/orders/${orderId}`),
      ),
  );
  revalidatePath(`/orders/${orderId}`);
}

export async function reviewGoldCertificate(certificateId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canVerifyGoldCertificates(session.role)) throw new Error("Forbidden");

  const decision = z.enum(["VERIFIED", "REJECTED"]).parse(formData.get("decision"));
  const cert = await db.goldCertificate.update({
    where: { id: certificateId },
    data: {
      verificationStatus: decision,
      verifiedById: session.staffId,
      verifiedAt: new Date(),
      notes: emptyToUndefined(formData.get("notes")),
    },
  });
  revalidatePath(`/orders/${cert.orderId}`);
}

export async function deleteGoldCertificate(certificateId: string) {
  const session = await requireSessionOrRedirect();
  if (!canVerifyGoldCertificates(session.role)) throw new Error("Forbidden");
  const cert = await db.goldCertificate.findUniqueOrThrow({ where: { id: certificateId } });
  await db.goldCertificate.delete({ where: { id: certificateId } });
  revalidatePath(`/orders/${cert.orderId}`);
}

// --- Handovers ---

export async function recordOrderHandover(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const { order } = await requireOrderAccess(orderId, session);

  const toStaffId = z.string().min(1).parse(formData.get("toStaffId"));
  const photoFiles = formData.getAll("photos").filter((f) => f instanceof File) as File[];
  const photos = await saveUploadedImages(photoFiles, "handovers");

  await db.orderHandover.create({
    data: {
      orderId,
      fromStaffId: session.staffId,
      toStaffId,
      materialsNote: emptyToUndefined(formData.get("materialsNote")),
      photos,
    },
  });

  const { notifyStaff } = await import("@/lib/notifications");
  if (toStaffId !== session.staffId) {
    await notifyStaff(toStaffId, "ORDER_ASSIGNED", "Work handed over to you", `${order.orderNumber} was handed over to you by ${session.name}.`, `/orders/${orderId}`);
  }
  revalidatePath(`/orders/${orderId}`);
}

export async function acknowledgeHandover(handoverId: string) {
  const session = await requireSessionOrRedirect();
  const handover = await db.orderHandover.findUniqueOrThrow({ where: { id: handoverId } });
  if (handover.toStaffId !== session.staffId) throw new Error("Only the receiving staff member can acknowledge this handover.");
  await db.orderHandover.update({ where: { id: handoverId }, data: { acknowledgedAt: new Date() } });
  revalidatePath(`/orders/${handover.orderId}`);
}
