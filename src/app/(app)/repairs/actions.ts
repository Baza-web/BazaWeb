"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageRepairs, canEditDeleteRepairs, isCompanyWide } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";
import { saveUploadedImages } from "@/lib/uploads";

const numOrUndef = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.number().optional(),
);

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value);
  return s === "" ? undefined : s;
}

const intakeSchema = z.object({
  customerId: z.string().min(1),
  type: z.enum(["REPAIR", "CUSTOM"]),
  description: z.string().min(2),
  promisedDate: z.coerce.date().optional(),
  estimatedCost: numOrUndef,
  relatedInventoryItemId: z.string().optional(),
  assignedToId: z.string().optional(),
  assignedSalesId: z.string().optional(),
  branchId: z.string().min(1),
  notes: z.string().optional(),
});

export async function createRepairOrder(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const session = await requireSessionOrRedirect();
  if (!canManageRepairs(session.roles)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.roles)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const rawParsed = intakeSchema.safeParse({
    customerId: formData.get("customerId"),
    type: formData.get("type"),
    description: formData.get("description"),
    promisedDate: formData.get("promisedDate") || undefined,
    estimatedCost: formData.get("estimatedCost"),
    relatedInventoryItemId: emptyToUndefined(formData.get("relatedInventoryItemId")),
    assignedToId: emptyToUndefined(formData.get("assignedToId")),
    assignedSalesId: emptyToUndefined(formData.get("assignedSalesId")),
    branchId,
    notes: emptyToUndefined(formData.get("notes")),
  });
  if (!rawParsed.success) return { error: "Fill in the required fields (customer, type, description, branch)." };
  const parsed = rawParsed.data;

  const customer = await db.customer.findFirst({ where: { id: parsed.customerId, branchId } });
  if (!customer) return { error: "That customer does not belong to this branch." };

  if (parsed.relatedInventoryItemId) {
    const item = await db.inventoryItem.findFirst({ where: { id: parsed.relatedInventoryItemId, branchId } });
    if (!item) return { error: "That inventory item does not belong to this branch." };
  }

  if (parsed.assignedToId) {
    const craftsman = await db.staff.findFirst({ where: { id: parsed.assignedToId, branchId, active: true } });
    if (!craftsman) return { error: "The assigned craftsman doesn't belong to this branch — pick one from the same branch, or create the order first and reassign." };
  }

  if (parsed.assignedSalesId) {
    const salesperson = await db.staff.findFirst({ where: { id: parsed.assignedSalesId, branchId, active: true } });
    if (!salesperson) return { error: "The assigned sales staff doesn't belong to this branch — pick one from the same branch, or create the order first and reassign." };
  }

  const files = formData.getAll("photos").filter((f) => f instanceof File) as File[];
  const photos = await saveUploadedImages(files, "repairs");

  const order = await db.repairOrder.create({
    data: { ...parsed, photos, createdById: session.staffId },
    include: { customer: true },
  });

  await Promise.all(
    [order.assignedToId, order.assignedSalesId]
      .filter((id): id is string => !!id)
      .map((staffId) =>
        notifyStaff(
          staffId,
          "REPAIR_UPDATE",
          `New ${order.type === "CUSTOM" ? "custom order" : "repair"} assigned`,
          `${order.customer.name}: ${order.description}`,
          "/repairs",
        ),
      ),
  );

  revalidatePath("/repairs");
  return { ok: true };
}

const statusSchema = z.enum(["RECEIVED", "IN_PROGRESS", "READY", "COMPLETED", "CANCELLED"]);

export async function updateRepairStatus(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();

  const order = await db.repairOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { customer: true, createdBy: true },
  });

  const isAssignedCraftsman = session.roles.includes("CRAFTSMAN") && order.assignedToId === session.staffId;
  if (!canManageRepairs(session.roles) && !isAssignedCraftsman) throw new Error("Forbidden");
  if (!isCompanyWide(session.roles) && order.branchId !== session.branchId) throw new Error("Forbidden");

  const status = statusSchema.parse(formData.get("status"));
  const finalCost = numOrUndef.parse(formData.get("finalCost"));

  await db.repairOrder.update({
    where: { id: orderId },
    data: {
      status,
      finalCost: finalCost ?? order.finalCost,
      completedAt: status === "COMPLETED" ? new Date() : order.completedAt,
    },
  });

  if (status === "READY" || status === "COMPLETED") {
    const notifyTargets = new Set([order.createdById]);
    const branchStaff = await db.staff.findMany({
      where: { branchId: order.branchId, active: true, role: { in: ["SALES", "MANAGER"] } },
    });
    branchStaff.forEach((s) => notifyTargets.add(s.id));

    await Promise.all(
      Array.from(notifyTargets).map((staffId) =>
        notifyStaff(
          staffId,
          "REPAIR_UPDATE",
          `${order.customer.name}'s order is ${status === "READY" ? "ready for pickup" : "completed"}`,
          order.description,
          "/repairs",
        ),
      ),
    );
  }

  revalidatePath("/repairs");
}

export async function assignRepairOrder(orderId: string, formData: FormData): Promise<{ error: string } | { ok: true }> {
  const session = await requireSessionOrRedirect();
  if (!canManageRepairs(session.roles)) throw new Error("Forbidden");

  const existing = await db.repairOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (!isCompanyWide(session.roles) && existing.branchId !== session.branchId) throw new Error("Forbidden");

  const assignedToId = emptyToUndefined(formData.get("assignedToId"));
  if (assignedToId) {
    const craftsman = await db.staff.findFirst({
      where: { id: assignedToId, branchId: existing.branchId, active: true },
    });
    if (!craftsman) return { error: "That staff member doesn't belong to this order's branch." };
  }

  const order = await db.repairOrder.update({
    where: { id: orderId },
    data: { assignedToId: assignedToId ?? null },
    include: { customer: true },
  });

  if (assignedToId) {
    await notifyStaff(
      assignedToId,
      "REPAIR_UPDATE",
      `${order.type === "CUSTOM" ? "Custom order" : "Repair"} assigned to you`,
      `${order.customer.name}: ${order.description}`,
      "/repairs",
    );
  }

  revalidatePath("/repairs");
  return { ok: true };
}

export async function assignSalesRepairOrder(orderId: string, formData: FormData): Promise<{ error: string } | { ok: true }> {
  const session = await requireSessionOrRedirect();
  if (!canManageRepairs(session.roles)) throw new Error("Forbidden");

  const existing = await db.repairOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (!isCompanyWide(session.roles) && existing.branchId !== session.branchId) throw new Error("Forbidden");

  const assignedSalesId = emptyToUndefined(formData.get("assignedSalesId"));
  if (assignedSalesId) {
    const salesperson = await db.staff.findFirst({
      where: { id: assignedSalesId, branchId: existing.branchId, active: true },
    });
    if (!salesperson) return { error: "That staff member doesn't belong to this order's branch." };
  }

  const order = await db.repairOrder.update({
    where: { id: orderId },
    data: { assignedSalesId: assignedSalesId ?? null },
    include: { customer: true },
  });

  if (assignedSalesId) {
    await notifyStaff(
      assignedSalesId,
      "REPAIR_UPDATE",
      `${order.type === "CUSTOM" ? "Custom order" : "Repair"} assigned to you`,
      `${order.customer.name}: ${order.description}`,
      "/repairs",
    );
  }

  revalidatePath("/repairs");
  return { ok: true };
}

const editSchema = z.object({
  type: z.enum(["REPAIR", "CUSTOM"]),
  description: z.string().min(2),
  promisedDate: z.coerce.date().optional(),
  estimatedCost: numOrUndef,
  relatedInventoryItemId: z.string().optional(),
});

/** Owner/Admin only — tighter than day-to-day intake/assignment, which every repair-manager role can already do. */
export async function updateRepairOrder(orderId: string, formData: FormData): Promise<{ error: string } | { ok: true }> {
  const session = await requireSessionOrRedirect();
  if (!canEditDeleteRepairs(session.roles)) throw new Error("Forbidden");

  const existing = await db.repairOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (!isCompanyWide(session.roles) && existing.branchId !== session.branchId) throw new Error("Forbidden");

  const rawParsed = editSchema.safeParse({
    type: formData.get("type"),
    description: formData.get("description"),
    promisedDate: formData.get("promisedDate") || undefined,
    estimatedCost: formData.get("estimatedCost"),
    relatedInventoryItemId: emptyToUndefined(formData.get("relatedInventoryItemId")),
  });
  if (!rawParsed.success) return { error: "Fill in the required fields (type, description)." };
  const parsed = rawParsed.data;

  if (parsed.relatedInventoryItemId) {
    const item = await db.inventoryItem.findFirst({ where: { id: parsed.relatedInventoryItemId, branchId: existing.branchId } });
    if (!item) return { error: "That inventory item doesn't belong to this order's branch." };
  }

  await db.repairOrder.update({
    where: { id: orderId },
    data: {
      type: parsed.type,
      description: parsed.description,
      promisedDate: parsed.promisedDate ?? null,
      estimatedCost: parsed.estimatedCost ?? null,
      relatedInventoryItemId: parsed.relatedInventoryItemId ?? null,
    },
  });

  revalidatePath("/repairs");
  return { ok: true };
}

/** Owner/Admin only. A repair/custom order has no other record pointing at it, so this is a plain delete — nothing to reverse or refuse. */
export async function deleteRepairOrder(orderId: string): Promise<{ error: string } | { ok: true }> {
  const session = await requireSessionOrRedirect();
  if (!canEditDeleteRepairs(session.roles)) throw new Error("Forbidden");

  const existing = await db.repairOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (!isCompanyWide(session.roles) && existing.branchId !== session.branchId) throw new Error("Forbidden");

  try {
    await db.repairOrder.delete({ where: { id: orderId } });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't delete this order." };
  }

  revalidatePath("/repairs");
  return { ok: true };
}
