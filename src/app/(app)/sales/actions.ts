"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { canRecordSale, isCompanyWide, COMPANY_WIDE_ROLES, branchScope, canDeleteOrRequest } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";
import { round2, formatMoney } from "@/lib/utils";
import { detectFileKind } from "@/lib/uploads";
import { extractOrderFromImage, extractOrderFromText, aiConfigured } from "@/lib/ai";
import { initiateDeletion } from "@/lib/deletion";
import { initiateEdit } from "@/lib/editRequests";
import { postSaleJournalEntry } from "@/lib/ledger";
import { earnRewardsForSale } from "@/lib/rewards";

const EXT_TO_MEDIA_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export type ScannedLine = { inventoryItemId: string | null; itemNameGuess: string; quantity: number; priceEach: number | null };
export type ScanOrderResult = {
  customerId: string | null;
  customerNameGuess: string | null;
  lines: ScannedLine[];
  unmatchedItems: string[];
  discount: number | null;
  amountPaid: number | null;
  paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER" | "MOBILE_MONEY" | "OTHER" | null;
  notes: string | null;
  error?: string;
};

const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").trim();
const normalizePhone = (s: string) => s.replace(/\D/g, "");

const EMPTY_SCAN_RESULT: ScanOrderResult = {
  customerId: null,
  customerNameGuess: null,
  lines: [],
  unmatchedItems: [],
  discount: null,
  amountPaid: null,
  paymentMethod: null,
  notes: null,
};

/**
 * Matches already-AI-extracted order fields against one branch's real
 * Customers/Inventory. Shared by the manual "Scan an order" flow (scanOrder,
 * below) and reviewWhatsAppOrder — both end up with the same
 * ExtractedOrder shape, just from a different source (a fresh upload vs. a
 * previously-received WhatsApp message), so the matching logic itself only
 * needs to live once.
 */
async function matchExtractedOrder(
  extracted: Awaited<ReturnType<typeof extractOrderFromText>>,
  branchId: string,
): Promise<ScanOrderResult> {
  const [inventory, customers] = await Promise.all([
    db.inventoryItem.findMany({ where: { branchId, status: "IN_STOCK", quantity: { gt: 0 } } }),
    db.customer.findMany({ where: { branchId } }),
  ]);

  let customerId: string | null = null;
  if (extracted.customerPhone) {
    const phoneDigits = normalizePhone(extracted.customerPhone);
    const match = customers.find((c) => c.phone && normalizePhone(c.phone).endsWith(phoneDigits.slice(-9)));
    if (match) customerId = match.id;
  }
  if (!customerId && extracted.customerName) {
    const needle = normalize(extracted.customerName);
    const match = customers.find((c) => normalize(c.name).includes(needle) || needle.includes(normalize(c.name)));
    if (match) customerId = match.id;
  }

  const lines: ScannedLine[] = [];
  const unmatchedItems: string[] = [];
  for (const item of extracted.items) {
    const needle = normalize(item.description);
    const match = inventory.find(
      (i) =>
        normalize(i.name).includes(needle) ||
        needle.includes(normalize(i.name)) ||
        i.sku.toLowerCase() === item.description.toLowerCase().trim(),
    );
    if (match) {
      lines.push({
        inventoryItemId: match.id,
        itemNameGuess: match.name,
        quantity: Math.min(item.quantity, match.quantity),
        priceEach: item.priceEach ?? match.sellingPrice,
      });
    } else {
      unmatchedItems.push(item.description);
    }
  }

  const notes = extracted.orderNumber ? `WhatsApp order ref: ${extracted.orderNumber}${extracted.notes ? ` — ${extracted.notes}` : ""}` : extracted.notes;

  return {
    customerId,
    customerNameGuess: extracted.customerName,
    lines,
    unmatchedItems,
    discount: extracted.discount,
    amountPaid: extracted.amountPaid,
    paymentMethod: extracted.paymentMethod,
    notes,
  };
}

/**
 * Reads a screenshot (or pasted text) of a WhatsApp order and asks AI to pull
 * out the customer, items, and payment details, then tries to match each
 * item/customer against this branch's real records. Never saves anything —
 * staff review and submit the actual sale form themselves.
 */
export async function scanOrder(branchId: string, formData: FormData): Promise<ScanOrderResult> {
  const session = await requireSessionOrRedirect();
  if (!canRecordSale(session.roles)) throw new Error("Forbidden");

  if (!aiConfigured()) {
    return { ...EMPTY_SCAN_RESULT, error: "Order scanning isn't set up yet — ask an Admin to add ANTHROPIC_API_KEY. You can still add items manually below." };
  }

  try {
    const file = formData.get("image");
    const text = formData.get("text");

    let extracted: Awaited<ReturnType<typeof extractOrderFromText>>;
    if (file instanceof File && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const detected = detectFileKind(buffer);
      if (!detected || detected.kind !== "image") {
        return { ...EMPTY_SCAN_RESULT, error: "That doesn't look like a photo — try a JPG, PNG, GIF, or WEBP screenshot." };
      }
      extracted = await extractOrderFromImage(buffer, EXT_TO_MEDIA_TYPE[detected.ext]);
    } else if (typeof text === "string" && text.trim().length > 0) {
      extracted = await extractOrderFromText(text.trim());
    } else {
      return { ...EMPTY_SCAN_RESULT, error: "Add a screenshot or paste some chat text first." };
    }

    if (extracted.items.length === 0 && !extracted.customerName) {
      return { ...EMPTY_SCAN_RESULT, error: "Couldn't find an order in that — enter the details manually below." };
    }

    return await matchExtractedOrder(extracted, branchId);
  } catch (err) {
    console.error("scanOrder failed:", err);
    return { ...EMPTY_SCAN_RESULT, error: "Something went wrong reading that — add the items manually below." };
  }
}

/**
 * Loads a previously-received WhatsApp order (captured by the webhook) and
 * matches it against the branch the reviewing staff member picked — WhatsApp
 * messages aren't branch-scoped on arrival, so this is the first point a
 * branch is known. Marks who reviewed it; actually recording the sale is
 * still a separate, explicit step (createSale), same as the manual scan.
 */
export async function reviewWhatsAppOrder(whatsappOrderId: string, branchId: string): Promise<ScanOrderResult> {
  const session = await requireSessionOrRedirect();
  if (!canRecordSale(session.roles)) throw new Error("Forbidden");

  const order = await db.whatsAppInboundOrder.findUniqueOrThrow({ where: { id: whatsappOrderId } });
  if (order.status !== "PENDING") {
    return { ...EMPTY_SCAN_RESULT, error: "This WhatsApp order was already reviewed by someone else." };
  }

  await db.whatsAppInboundOrder.update({
    where: { id: whatsappOrderId },
    data: { reviewedById: session.staffId, reviewedAt: new Date() },
  });

  const extracted = order.extractedJson as unknown as Awaited<ReturnType<typeof extractOrderFromText>>;
  return await matchExtractedOrder(extracted, branchId);
}

/** Marks a pending WhatsApp order as not a real order (spam, a question, already handled elsewhere) without creating a sale. */
export async function dismissWhatsAppOrder(whatsappOrderId: string) {
  const session = await requireSessionOrRedirect();
  if (!canRecordSale(session.roles)) throw new Error("Forbidden");

  await db.whatsAppInboundOrder.update({
    where: { id: whatsappOrderId },
    data: { status: "DISMISSED", reviewedById: session.staffId, reviewedAt: new Date() },
  });
  revalidatePath("/whatsapp-orders");
}

const lineSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  priceEach: z.coerce.number().min(0),
});

const saleSchema = z.object({
  customerId: z.string().optional(),
  branchId: z.string().min(1),
  brandId: z.string().optional(),
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
  if (!canRecordSale(session.roles)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.roles)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const rawItems = JSON.parse(String(formData.get("itemsJson") || "[]"));
  const whatsappOrderId = String(formData.get("whatsappOrderId") || "").trim() || null;

  const parsed = saleSchema.parse({
    customerId: formData.get("customerId") || undefined,
    branchId,
    brandId: formData.get("brandId") || undefined,
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
  let costOfGoodsSold = 0;
  for (const line of parsed.items) {
    const inv = inventoryItems.find((i) => i.id === line.inventoryItemId);
    if (!inv) throw new Error("One of the selected items is no longer available in this branch.");
    if (inv.quantity < line.quantity) throw new Error(`Not enough stock for ${inv.name}`);
    subtotal += round2(line.priceEach * line.quantity);
    costOfGoodsSold += round2(inv.costPrice * line.quantity);
  }
  subtotal = round2(subtotal);
  costOfGoodsSold = round2(costOfGoodsSold);

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
        brandId: parsed.brandId || null,
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

    if (whatsappOrderId) {
      // Guarded update, same pattern as the inventory decrement below: only
      // succeeds if this WhatsApp order is still PENDING at this exact
      // moment, so two staff reviewing the same message can never both
      // convert it into two separate sales.
      const linked = await tx.whatsAppInboundOrder.updateMany({
        where: { id: whatsappOrderId, status: "PENDING" },
        data: { status: "CONVERTED", saleId: created.id, reviewedById: session.staffId, reviewedAt: new Date() },
      });
      if (linked.count !== 1) {
        throw new Error("This WhatsApp order was already recorded as a sale — check Sales before recording it again.");
      }
    }

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

    await postSaleJournalEntry(
      session,
      { id: created.id, invoiceNumber: created.invoiceNumber, branchId: parsed.branchId, total, amountPaid },
      costOfGoodsSold,
      tx,
    );

    await earnRewardsForSale(parsed.customerId || null, created.id, total, tx);

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

  if (whatsappOrderId) revalidatePath("/whatsapp-orders");
  redirect(`/sales/${sale.created.id}`);
}

/**
 * Voids and deletes a sale: Owner deletes immediately, Admin can only request
 * it pending Owner approval. Voiding restores the sold stock and removes the
 * ledger income entry before the sale row itself is deleted.
 */
export async function deleteSalePermanently(saleId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canDeleteOrRequest(session.roles)) throw new Error("Forbidden");

  const sale = await db.sale.findFirst({ where: { id: saleId, ...branchScope(session) } });
  if (!sale) throw new Error("Forbidden");

  const reason = String(formData.get("reason") || "").trim() || undefined;
  const result = await initiateDeletion(session, "SALE", saleId, sale.invoiceNumber, reason);
  revalidatePath("/sales");
  revalidatePath(`/sales/${saleId}`);
  return result;
}

const saleEditSchema = z.object({
  customerId: z.string().optional(),
  brandId: z.string().optional(),
  discount: z.coerce.number().min(0),
  amountPaid: z.coerce.number().min(0),
  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER"]),
  notes: z.string().optional(),
});

/**
 * Edits a sale's customer/brand/discount/payment details — never its items
 * or subtotal, which stay tied to the inventory that was actually sold.
 * Owner's edit applies immediately and recomputes total/payment status
 * (and the linked ledger entry) to match; anyone else's is a pending
 * request an Owner must approve first.
 */
export async function updateSale(saleId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canDeleteOrRequest(session.roles)) throw new Error("Forbidden");
  const sale = await db.sale.findFirst({ where: { id: saleId, ...branchScope(session) } });
  if (!sale) throw new Error("Forbidden");

  const parsed = saleEditSchema.parse({
    customerId: formData.get("customerId") || undefined,
    brandId: formData.get("brandId") || undefined,
    discount: formData.get("discount") || 0,
    amountPaid: formData.get("amountPaid") || 0,
    paymentMethod: formData.get("paymentMethod"),
    notes: formData.get("notes") || undefined,
  });

  const changeNotes: string[] = [];
  if (parsed.discount !== sale.discount) changeNotes.push(`Discount: ${formatMoney(sale.discount)} → ${formatMoney(parsed.discount)}`);
  if (parsed.amountPaid !== sale.amountPaid) changeNotes.push(`Amount paid: ${formatMoney(sale.amountPaid)} → ${formatMoney(parsed.amountPaid)}`);
  if (parsed.paymentMethod !== sale.paymentMethod) changeNotes.push(`Payment method: ${sale.paymentMethod} → ${parsed.paymentMethod}`);
  const fieldSummary = changeNotes.length > 0 ? changeNotes.join("; ") : "Updated sale details";

  await initiateEdit(session, "SALE", saleId, sale.invoiceNumber, fieldSummary, {
    customerId: parsed.customerId ?? null,
    brandId: parsed.brandId ?? null,
    discount: parsed.discount,
    amountPaid: parsed.amountPaid,
    paymentMethod: parsed.paymentMethod,
    notes: parsed.notes ?? null,
  });
  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/sales");
  revalidatePath("/edit-requests");
}
