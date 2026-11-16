import "server-only";
import { db } from "./db";
import type { SessionPayload } from "./auth";
import type { Prisma } from "@prisma/client";
import { round2 } from "./utils";
import { notifyStaff } from "./notifications";

export type EditableEntityType = "STAFF" | "INVENTORY" | "CUSTOMER" | "SALE" | "BRAND";

async function notifyOwners(title: string, body: string, link: string) {
  const owners = await db.staff.findMany({ where: { role: "OWNER", active: true } });
  await Promise.all(owners.map((o) => notifyStaff(o.id, "SYSTEM", title, body, link)));
}

/**
 * A sale's total/paymentStatus are derived from its items (unaffected here)
 * and discount/amountPaid (what this edit can change) — never store the
 * client's proposed `total` directly, or it can drift from the real
 * subtotal and desync from the ledger entry that records its income.
 */
async function applySaleEdit(id: string, data: Prisma.JsonObject) {
  const sale = await db.sale.findUniqueOrThrow({ where: { id } });
  const { discount: rawDiscount, amountPaid: rawAmountPaid, ...rest } = data;
  const discount = typeof rawDiscount === "number" ? rawDiscount : sale.discount;
  const amountPaid = typeof rawAmountPaid === "number" ? rawAmountPaid : sale.amountPaid;
  const total = Math.max(round2(sale.subtotal - discount), 0);
  const paymentStatus = amountPaid >= total ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID";

  await db.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id },
      data: { ...(rest as Prisma.SaleUpdateInput), discount, amountPaid, total, paymentStatus },
    });
    await tx.ledgerEntry.updateMany({ where: { saleId: id }, data: { amount: total } });
  });
}

/** A BRAND request with no real record yet (`__create`) creates one on approval; otherwise it updates the existing brand. */
async function applyBrandEdit(id: string, data: Prisma.JsonObject) {
  const { __create, ...rest } = data as Prisma.JsonObject & { __create?: boolean };
  if (__create) {
    const name = String(rest.name);
    const existing = await db.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (existing) throw new Error(`A brand named "${name}" already exists.`);
    await db.brand.create({ data: { name } });
    return;
  }
  await db.brand.update({ where: { id }, data: rest as Prisma.BrandUpdateInput });
}

const PERFORMERS: Record<EditableEntityType, (id: string, data: Prisma.JsonObject) => Promise<void>> = {
  STAFF: async (id, data) => {
    await db.staff.update({ where: { id }, data: data as Prisma.StaffUpdateInput });
  },
  INVENTORY: async (id, data) => {
    await db.inventoryItem.update({ where: { id }, data: data as Prisma.InventoryItemUpdateInput });
  },
  CUSTOMER: async (id, data) => {
    await db.customer.update({ where: { id }, data: data as Prisma.CustomerUpdateInput });
  },
  SALE: applySaleEdit,
  BRAND: applyBrandEdit,
};

async function assertNoPendingRequest(entityType: EditableEntityType, entityId: string) {
  const existing = await db.editRequest.findFirst({ where: { entityType, entityId, status: "PENDING" } });
  if (existing) throw new Error("An edit request for this is already pending Owner review.");
}

/**
 * Owner's edits apply immediately. Anyone else (Admin, Manager) creates a
 * pending request instead — a different Owner must approve it before the
 * change actually takes effect. Mirrors initiateDeletion's maker-checker
 * pattern exactly, so edits and deletes follow the same rule.
 */
export async function initiateEdit(
  session: SessionPayload,
  entityType: EditableEntityType,
  entityId: string,
  entityLabel: string,
  fieldSummary: string,
  proposedData: Prisma.JsonObject,
  reason?: string,
): Promise<{ status: "applied" | "requested" }> {
  await assertNoPendingRequest(entityType, entityId);

  if (session.role === "OWNER") {
    await PERFORMERS[entityType](entityId, proposedData);
    return { status: "applied" };
  }

  await db.editRequest.create({
    data: { entityType, entityId, entityLabel, fieldSummary, proposedData, reason, requestedById: session.staffId },
  });
  await notifyOwners(
    "Edit awaiting approval",
    `${session.name} wants to update ${entityLabel} — ${fieldSummary}`,
    "/edit-requests",
  );
  return { status: "requested" };
}

export async function reviewEditRequest(session: SessionPayload, requestId: string, decision: "APPROVED" | "REJECTED") {
  const request = await db.editRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "PENDING") throw new Error("This request has already been reviewed.");
  if (request.requestedById === session.staffId) {
    throw new Error("You can't approve or reject your own request — ask another Owner to review it.");
  }

  if (decision === "APPROVED") {
    await PERFORMERS[request.entityType as EditableEntityType](request.entityId, request.proposedData as Prisma.JsonObject);
  }
  await db.editRequest.update({
    where: { id: requestId },
    data: { status: decision, reviewedById: session.staffId, reviewedAt: new Date() },
  });
  await notifyStaff(
    request.requestedById,
    "SYSTEM",
    decision === "APPROVED" ? "Your edit was approved" : "Your edit was rejected",
    `${session.name} ${decision === "APPROVED" ? "approved" : "rejected"} your edit to ${request.entityLabel} — ${request.fieldSummary}`,
    "/edit-requests",
  );
}
