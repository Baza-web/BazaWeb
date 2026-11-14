"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, canManagePurchasing, isCompanyWide } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";
import { round2 } from "@/lib/utils";

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value);
  return s === "" ? undefined : s;
}

const supplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export async function createSupplier(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManagePurchasing(session.role)) throw new Error("Forbidden");

  const parsed = supplierSchema.parse({
    name: formData.get("name"),
    contactName: emptyToUndefined(formData.get("contactName")),
    phone: emptyToUndefined(formData.get("phone")),
    email: emptyToUndefined(formData.get("email")),
    address: emptyToUndefined(formData.get("address")),
    notes: emptyToUndefined(formData.get("notes")),
  });

  await db.supplier.create({ data: parsed });
  revalidatePath("/purchasing");
}

const poLineSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  unitCost: z.coerce.number().min(0),
});

const poSchema = z.object({
  supplierId: z.string().min(1),
  branchId: z.string().min(1),
  expectedDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  items: z.array(poLineSchema).min(1),
});

function orderNumber() {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `PO-${Date.now().toString(36).toUpperCase()}-${random}`;
}

export async function createPurchaseOrder(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManagePurchasing(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const rawItems = JSON.parse(String(formData.get("itemsJson") || "[]"));

  const parsed = poSchema.parse({
    supplierId: formData.get("supplierId"),
    branchId,
    expectedDate: formData.get("expectedDate") || undefined,
    notes: emptyToUndefined(formData.get("notes")),
    items: rawItems,
  });

  const totalAmount = round2(parsed.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0));

  await db.purchaseOrder.create({
    data: {
      orderNumber: orderNumber(),
      supplierId: parsed.supplierId,
      branchId: parsed.branchId,
      expectedDate: parsed.expectedDate,
      notes: parsed.notes,
      totalAmount,
      createdById: session.staffId,
      items: { create: parsed.items },
    },
  });

  revalidatePath("/purchasing");
}

const statusSchema = z.enum(["DRAFT", "ORDERED", "RECEIVED", "CANCELLED"]);

export async function updatePurchaseOrderStatus(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManagePurchasing(session.role)) throw new Error("Forbidden");

  const order = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { supplier: true },
  });
  if (!isCompanyWide(session.role) && order.branchId !== session.branchId) throw new Error("Forbidden");

  const status = statusSchema.parse(formData.get("status"));
  await db.purchaseOrder.update({ where: { id: orderId }, data: { status } });

  if (status === "RECEIVED") {
    const recipients = await db.staff.findMany({
      where: { branchId: order.branchId, active: true, role: { in: ["MANAGER", "ACCOUNTANT"] } },
    });
    await Promise.all(
      recipients.map((r) =>
        notifyStaff(
          r.id,
          "PURCHASE_ORDER_UPDATE",
          `${order.orderNumber} received`,
          `Order from ${order.supplier.name} has been marked received.`,
          "/purchasing",
        ),
      ),
    );
  }

  revalidatePath("/purchasing");
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
});

export async function recordPurchaseOrderPayment(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) throw new Error("Forbidden");

  const order = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { supplier: true },
  });
  if (!isCompanyWide(session.role) && order.branchId !== session.branchId) throw new Error("Forbidden");

  const { amount } = paymentSchema.parse({ amount: formData.get("amount") });
  const roundedAmount = round2(amount);

  await db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        branchId: order.branchId,
        category: "Purchase order",
        description: `Payment for ${order.orderNumber} — ${order.supplier.name}`,
        amount: roundedAmount,
        createdById: session.staffId,
        purchaseOrderId: order.id,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        branchId: order.branchId,
        type: "EXPENSE",
        amount: roundedAmount,
        description: `${order.orderNumber}: payment to ${order.supplier.name}`,
        date: expense.date,
        expenseId: expense.id,
      },
    });

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { amountPaid: round2(order.amountPaid + roundedAmount) },
    });
  });

  revalidatePath("/purchasing");
  revalidatePath("/accounting");
}
