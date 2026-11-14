"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canRecordSale, isCompanyWide, COMPANY_WIDE_ROLES } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";
import { round2 } from "@/lib/utils";

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
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `INV-${Date.now().toString(36).toUpperCase()}-${random}`;
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

  const itemIds = parsed.items.map((i) => i.inventoryItemId);
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("The same item appears more than once in this sale — combine it into a single line.");
  }

  if (parsed.customerId) {
    const customer = await db.customer.findFirst({
      where: { id: parsed.customerId, branchId: parsed.branchId },
    });
    if (!customer) throw new Error("That customer does not belong to this branch.");
  }

  // Re-fetch authoritative prices/stock from the DB; never trust client totals.
  // Scoped to this sale's branch and in-stock items only — a stale or
  // out-of-branch item id simply won't be found here.
  const inventoryItems = await db.inventoryItem.findMany({
    where: { id: { in: itemIds }, branchId: parsed.branchId, status: "IN_STOCK" },
  });

  let subtotal = 0;
  for (const line of parsed.items) {
    const inv = inventoryItems.find((i) => i.id === line.inventoryItemId);
    if (!inv) throw new Error("One of the selected items is no longer available in this branch.");
    if (inv.quantity < line.quantity) throw new Error(`Not enough stock for ${inv.name}`);
    subtotal += round2(line.priceEach * line.quantity);
  }
  subtotal = round2(subtotal);

  const discount = round2(parsed.discount);
  const tax = round2(parsed.tax);
  const amountPaid = round2(parsed.amountPaid);
  const total = round2(Math.max(subtotal - discount + tax, 0));
  const paymentStatus = amountPaid >= total ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID";

  const sale = await db.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        invoiceNumber: invoiceNumber(),
        customerId: parsed.customerId || null,
        branchId: parsed.branchId,
        staffId: session.staffId,
        subtotal,
        discount,
        tax,
        total,
        amountPaid,
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

    const finalQuantities: Record<string, number> = {};
    for (const line of parsed.items) {
      const inv = inventoryItems.find((i) => i.id === line.inventoryItemId)!;
      // Atomic, guarded decrement: only succeeds if the row still has enough
      // stock *at the moment of this update*, so two concurrent sales can
      // never both succeed in selling the last unit.
      const result = await tx.inventoryItem.updateMany({
        where: {
          id: inv.id,
          branchId: parsed.branchId,
          status: "IN_STOCK",
          quantity: { gte: line.quantity },
        },
        data: { quantity: { decrement: line.quantity } },
      });
      if (result.count !== 1) {
        throw new Error(`Not enough stock for ${inv.name} — someone else may have just sold it.`);
      }
      const updated = await tx.inventoryItem.findUniqueOrThrow({ where: { id: inv.id } });
      if (updated.quantity <= 0) {
        await tx.inventoryItem.update({ where: { id: inv.id }, data: { status: "SOLD" } });
      }
      finalQuantities[inv.id] = updated.quantity;
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

    return { created, finalQuantities };
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
          `${session.name} recorded ${sale.created.invoiceNumber} for a total of ${total.toFixed(2)}.`,
          `/sales/${sale.created.id}`,
        ),
      ),
  );

  for (const line of parsed.items) {
    const inv = inventoryItems.find((i) => i.id === line.inventoryItemId)!;
    const remaining = sale.finalQuantities[inv.id];
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

  redirect(`/sales/${sale.created.id}`);
}
