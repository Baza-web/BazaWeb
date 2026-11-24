"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageSupplyCatalog, canCheckOutSuppliesOrTools } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";
import type { SupplyCategory, ToolCondition } from "@prisma/client";

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

async function notifyLowStockIfNeeded(supplyItemId: string) {
  const item = await db.supplyItem.findUniqueOrThrow({ where: { id: supplyItemId } });
  if (item.quantity > item.minimumStock) return;
  const managers = await db.staff.findMany({ where: { active: true, role: { in: ["OWNER", "ADMIN"] } } });
  await Promise.all(
    managers.map((m) =>
      notifyStaff(
        m.id,
        "LOW_STOCK",
        item.quantity <= 0 ? "Supply out of stock" : "Supply at reorder level",
        `${item.name} is ${item.quantity <= 0 ? "out of stock" : `down to ${item.quantity}, at or below its minimum of ${item.minimumStock}`}.`,
        "/workshop",
      ),
    ),
  );
}

// --- Supply catalog ---

export async function createSupplyItem(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageSupplyCatalog(session.role)) throw new Error("Forbidden");

  await db.supplyItem.create({
    data: {
      sku: z.string().min(1).parse(formData.get("sku")),
      name: z.string().min(1).parse(formData.get("name")),
      category: z.enum(["OFFICE_SUPPLY", "JEWELLERY_BOX", "PACKAGING", "CONSUMABLE"]).parse(formData.get("category")) as SupplyCategory,
      unit: emptyToUndefined(formData.get("unit")),
      quantity: numOrUndef(formData.get("quantity")) ?? 0,
      minimumStock: numOrUndef(formData.get("minimumStock")) ?? 0,
      purchasePrice: numOrUndef(formData.get("purchasePrice")),
      storageLocation: emptyToUndefined(formData.get("storageLocation")),
      branchId: emptyToUndefined(formData.get("branchId")),
      notes: emptyToUndefined(formData.get("notes")),
    },
  });
  revalidatePath("/workshop");
}

export async function restockSupplyItem(supplyItemId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageSupplyCatalog(session.role)) throw new Error("Forbidden");

  const amount = z.coerce.number().positive().parse(formData.get("amount"));
  await db.supplyItem.update({ where: { id: supplyItemId }, data: { quantity: { increment: amount } } });
  revalidatePath("/workshop");
}

/** Decrements stock and records who/what it went to — the one "stock movement" record this narrow model keeps. */
export async function issueSupply(supplyItemId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canCheckOutSuppliesOrTools(session.role)) throw new Error("Forbidden");

  const quantity = z.coerce.number().int().positive().parse(formData.get("quantity"));
  const item = await db.supplyItem.findUniqueOrThrow({ where: { id: supplyItemId } });
  if (item.quantity < quantity) throw new Error(`Only ${item.quantity} left in stock.`);

  await db.$transaction([
    db.supplyItem.update({ where: { id: supplyItemId }, data: { quantity: { decrement: quantity } } }),
    db.supplyIssue.create({
      data: {
        supplyItemId,
        quantity,
        issuedToStaffId: session.staffId,
        orderId: emptyToUndefined(formData.get("orderId")),
        reason: emptyToUndefined(formData.get("reason")),
      },
    }),
  ]);

  await notifyLowStockIfNeeded(supplyItemId);
  revalidatePath("/workshop");
}

export async function deleteSupplyItem(supplyItemId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageSupplyCatalog(session.role)) throw new Error("Forbidden");
  await db.supplyItem.delete({ where: { id: supplyItemId } });
  revalidatePath("/workshop");
}

// --- Workshop tools ---

export async function createWorkshopTool(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageSupplyCatalog(session.role)) throw new Error("Forbidden");

  await db.workshopTool.create({
    data: {
      toolId: z.string().min(1).parse(formData.get("toolId")),
      name: z.string().min(1).parse(formData.get("name")),
      notes: emptyToUndefined(formData.get("notes")),
    },
  });
  revalidatePath("/workshop");
}

export async function checkOutTool(toolId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canCheckOutSuppliesOrTools(session.role)) throw new Error("Forbidden");

  const assignedStaffId = z.string().min(1).parse(formData.get("assignedStaffId"));
  const expectedReturnDate = formData.get("expectedReturnDate") ? new Date(String(formData.get("expectedReturnDate"))) : undefined;
  await db.workshopTool.update({
    where: { id: toolId },
    data: { assignedStaffId, issueDate: new Date(), expectedReturnDate, returnDate: null },
  });
  revalidatePath("/workshop");
}

export async function returnTool(toolId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canCheckOutSuppliesOrTools(session.role)) throw new Error("Forbidden");

  const condition = z.enum(["GOOD", "DAMAGED", "MISSING", "UNDER_MAINTENANCE"]).parse(formData.get("condition")) as ToolCondition;
  await db.workshopTool.update({
    where: { id: toolId },
    data: { returnDate: new Date(), condition, assignedStaffId: null },
  });

  if (condition === "DAMAGED" || condition === "MISSING") {
    const managers = await db.staff.findMany({ where: { active: true, role: { in: ["OWNER", "ADMIN"] } } });
    const tool = await db.workshopTool.findUniqueOrThrow({ where: { id: toolId } });
    await Promise.all(
      managers.map((m) =>
        notifyStaff(m.id, "SYSTEM", `Tool ${condition.toLowerCase()}`, `${tool.name} (${tool.toolId}) was returned marked ${condition}.`, "/workshop"),
      ),
    );
  }
  revalidatePath("/workshop");
}

export async function logToolMaintenance(toolId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageSupplyCatalog(session.role)) throw new Error("Forbidden");

  await db.toolMaintenanceLog.create({
    data: {
      toolId,
      loggedById: session.staffId,
      note: z.string().min(1).parse(formData.get("note")),
      cost: numOrUndef(formData.get("cost")),
    },
  });
  await db.workshopTool.update({ where: { id: toolId }, data: { condition: "GOOD" } });
  revalidatePath("/workshop");
}

export async function deleteWorkshopTool(toolId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageSupplyCatalog(session.role)) throw new Error("Forbidden");
  await db.workshopTool.delete({ where: { id: toolId } });
  revalidatePath("/workshop");
}
