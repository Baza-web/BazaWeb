"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageRepairs, isCompanyWide } from "@/lib/rbac";
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
  branchId: z.string().min(1),
  notes: z.string().optional(),
});

export async function createRepairOrder(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageRepairs(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const parsed = intakeSchema.parse({
    customerId: formData.get("customerId"),
    type: formData.get("type"),
    description: formData.get("description"),
    promisedDate: formData.get("promisedDate") || undefined,
    estimatedCost: formData.get("estimatedCost"),
    relatedInventoryItemId: emptyToUndefined(formData.get("relatedInventoryItemId")),
    assignedToId: emptyToUndefined(formData.get("assignedToId")),
    branchId,
    notes: emptyToUndefined(formData.get("notes")),
  });

  const customer = await db.customer.findFirst({ where: { id: parsed.customerId, branchId } });
  if (!customer) throw new Error("That customer does not belong to this branch.");

  if (parsed.relatedInventoryItemId) {
    const item = await db.inventoryItem.findFirst({ where: { id: parsed.relatedInventoryItemId, branchId } });
    if (!item) throw new Error("That inventory item does not belong to this branch.");
  }

  if (parsed.assignedToId) {
    const craftsman = await db.staff.findFirst({ where: { id: parsed.assignedToId, branchId, active: true } });
    if (!craftsman) throw new Error("That staff member does not belong to this branch.");
  }

  const files = formData.getAll("photos").filter((f) => f instanceof File) as File[];
  const photos = await saveUploadedImages(files, "repairs");

  const order = await db.repairOrder.create({
    data: { ...parsed, photos, createdById: session.staffId },
    include: { customer: true },
  });

  if (order.assignedToId) {
    await notifyStaff(
      order.assignedToId,
      "REPAIR_UPDATE",
      `New ${order.type === "CUSTOM" ? "custom order" : "repair"} assigned`,
      `${order.customer.name}: ${order.description}`,
      "/repairs",
    );
  }

  revalidatePath("/repairs");
}

const statusSchema = z.enum(["RECEIVED", "IN_PROGRESS", "READY", "COMPLETED", "CANCELLED"]);

export async function updateRepairStatus(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();

  const order = await db.repairOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { customer: true, createdBy: true },
  });

  const isAssignedCraftsman = session.role === "CRAFTSMAN" && order.assignedToId === session.staffId;
  if (!canManageRepairs(session.role) && !isAssignedCraftsman) throw new Error("Forbidden");
  if (!isCompanyWide(session.role) && order.branchId !== session.branchId) throw new Error("Forbidden");

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

export async function assignRepairOrder(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageRepairs(session.role)) throw new Error("Forbidden");

  const existing = await db.repairOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (!isCompanyWide(session.role) && existing.branchId !== session.branchId) throw new Error("Forbidden");

  const assignedToId = emptyToUndefined(formData.get("assignedToId"));
  if (assignedToId) {
    const craftsman = await db.staff.findFirst({
      where: { id: assignedToId, branchId: existing.branchId, active: true },
    });
    if (!craftsman) throw new Error("That staff member does not belong to this branch.");
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
}
