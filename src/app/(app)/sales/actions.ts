"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canRecordSale, isCompanyWide, COMPANY_WIDE_ROLES } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";

const lineSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  priceEach: z.coerce.number().min(0),
});

const saleSchema = z.object({
  customerId: z.string().optional(),
  branchId: z.string().min(1),
  discount: z.coerce.number().min(0).default(0),
  tax: z.coerce.number().min(0).default(0),
  amountPaid: z.coerce.number().min(0).default(0),
  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER"]),
  notes: z.string().optional(),
  items: z.array(lineSchema).min(1),
});

function invoiceNumber() {
  return `INV-${Date.now().toString(36).toUpperCase()}`;
}

export async function createSale(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canRecordSale(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const rawItems = JSON.parse(String(formData.get("itemsJson") || "[]"));

  const parsed = saleSchema.parse({
    customerId: formData.get("customerId") || undefined,
    branchId,
    discount: formData.get("discount") || 0,
    tax: formData.get("tax") || 0,
    amountPaid: formData.get("amountPaid") || 0,
    paymentMethod: formData.get("paymentMethod"),
    notes: formData.get("notes") || undefined,
    items: rawItems,
  });

  // Re-fetch authoritative prices/stock from the DB; never trust client totals.
  const inventoryItems = await db.inventoryItem.findMany({
    where: { id: { in: parsed.items.map((i) => i.inventoryItemId) } },
  });

  let subtotal = 0;
  for (const line of parsed.items) {
    const inv = inventoryItems.find((i) => i.id === line.inventoryItemId);
    if (!inv) throw new Error("Item not found");
    if (inv.quantity < line.quantity) throw new Error(`Not enough stock for ${inv.name}`);
    subtotal += line.priceEach * line.quantity;
  }

  const total = Math.max(subtotal - parsed.discount + parsed.tax, 0);
  const paymentStatus = parsed.amountPaid >= total ? "PAID" : parsed.amountPaid > 0 ? "PARTIAL" : "UNPAID";

  const sale = await db.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        invoiceNumber: invoiceNumber(),
        customerId: parsed.customerId || null,
        branchId: parsed.branchId,
        staffId: session.staffId,
        subtotal,
        discount: parsed.discount,
        tax: parsed.tax,
        total,
        amountPaid: parsed.amountPaid,
        paymentStatus,
        paymentMethod: parsed.paymentMethod,
        notes: parsed.notes,
        items: {
          create: parsed.items.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
            priceEach: line.priceEach,
          })),
        },
      },
    });

    for (const line of parsed.items) {
      const inv = inventoryItems.find((i) => i.id === line.inventoryItemId)!;
      const remaining = inv.quantity - line.quantity;
      await tx.inventoryItem.update({
        where: { id: inv.id },
        data: {
          quantity: remaining,
          status: remaining <= 0 ? "SOLD" : inv.status,
        },
      });
    }

    await tx.ledgerEntry.create({
      data: {
        branchId: parsed.branchId,
        type: "INCOME",
        amount: total,
        description: `Sale ${created.invoiceNumber}`,
        saleId: created.id,
      },
    });

    return created;
  });

  const toNotify = await db.staff.findMany({
    where: {
      active: true,
      OR: [{ branchId: parsed.branchId, role: "MANAGER" }, { role: { in: COMPANY_WIDE_ROLES } }],
    },
  });
  await Promise.all(
    toNotify
      .filter((a) => a.id !== session.staffId)
      .map((a) =>
        notifyStaff(
          a.id,
          "SALE_CREATED",
          "New sale recorded",
          `${session.name} recorded ${sale.invoiceNumber} for a total of ${total.toFixed(2)}.`,
          `/sales/${sale.id}`,
        ),
      ),
  );

  for (const line of parsed.items) {
    const inv = inventoryItems.find((i) => i.id === line.inventoryItemId)!;
    const remaining = inv.quantity - line.quantity;
    if (remaining <= inv.lowStockAt) {
      await Promise.all(
        toNotify
          .filter((a) => a.id !== session.staffId)
          .map((a) =>
            notifyStaff(
              a.id,
              "LOW_STOCK",
              "Low stock alert",
              `${inv.name} (${inv.sku}) is down to ${remaining} unit${remaining === 1 ? "" : "s"}.`,
              `/inventory/${inv.id}`,
            ),
          ),
      );
    }
  }

  redirect(`/sales/${sale.id}`);
}
