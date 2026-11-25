import "server-only";
import { db } from "./db";
import type { SessionPayload } from "./auth";
import type { Prisma } from "@prisma/client";
import { round2 } from "./utils";
import { notifyStaff } from "./notifications";
import { repostSaleJournalEntry, repostExpenseJournalEntry } from "./ledger";

export type EditableEntityType = "STAFF" | "INVENTORY" | "CUSTOMER" | "SALE" | "BRAND" | "EXPENSE" | "BROKER";

/** Admin edits/reviews these entity types directly, same as Owner; every other type stays Owner-only. */
const ADMIN_DIRECT_ENTITY_TYPES = new Set<EditableEntityType>(["CUSTOMER", "STAFF", "BRAND"]);

/** Customer/Staff requests also notify Admins, since Admin can review those too (every other entity type stays Owner-only). */
async function notifyReviewers(entityType: EditableEntityType, title: string, body: string, link: string) {
  const roles = ADMIN_DIRECT_ENTITY_TYPES.has(entityType) ? (["OWNER", "ADMIN"] as const) : (["OWNER"] as const);
  const reviewers = await db.staff.findMany({ where: { role: { in: [...roles] }, active: true } });
  await Promise.all(reviewers.map((r) => notifyStaff(r.id, "SYSTEM", title, body, link)));
}

/**
 * A sale's total/paymentStatus are derived from its items (unaffected here)
 * and discount/amountPaid (what this edit can change) — never store the
 * client's proposed `total` directly, or it can drift from the real
 * subtotal and desync from the ledger entry that records its income.
 */
async function applySaleEdit(id: string, data: Prisma.JsonObject, session: SessionPayload) {
  const sale = await db.sale.findUniqueOrThrow({ where: { id }, include: { items: { include: { inventoryItem: true } } } });
  const { discount: rawDiscount, amountPaid: rawAmountPaid, ...rest } = data;
  const discount = typeof rawDiscount === "number" ? rawDiscount : sale.discount;
  const amountPaid = typeof rawAmountPaid === "number" ? rawAmountPaid : sale.amountPaid;
  const total = Math.max(round2(sale.subtotal - discount), 0);
  const paymentStatus = amountPaid >= total ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID";
  const costOfGoodsSold = round2(sale.items.reduce((s, it) => s + it.inventoryItem.costPrice * it.quantity, 0));

  await db.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id },
      data: { ...(rest as Prisma.SaleUpdateInput), discount, amountPaid, total, paymentStatus },
    });
    await tx.ledgerEntry.updateMany({ where: { saleId: id }, data: { amount: total } });
    await repostSaleJournalEntry(
      session,
      { id, invoiceNumber: sale.invoiceNumber, branchId: sale.branchId, total, amountPaid },
      costOfGoodsSold,
      tx,
    );
  });
}

/**
 * A BRAND request with no real record yet (`__create`) creates one on approval, along with its
 * matching Project — every brand doubles as a project for task grouping with no extra setup
 * step, kept in sync here and on rename below. Otherwise it updates the existing brand.
 */
async function applyBrandEdit(id: string, data: Prisma.JsonObject, session: SessionPayload) {
  const { __create, ...rest } = data as Prisma.JsonObject & { __create?: boolean };
  if (__create) {
    const name = String(rest.name);
    const existing = await db.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (existing) throw new Error(`A brand named "${name}" already exists.`);
    const brand = await db.brand.create({ data: { name } });
    await db.project.create({ data: { name, brandId: brand.id, createdById: session.staffId } });
    return;
  }
  await db.brand.update({ where: { id }, data: rest as Prisma.BrandUpdateInput });
  if (typeof rest.name === "string") {
    await db.project.updateMany({ where: { brandId: id }, data: { name: rest.name } });
  }
}

/** Keeps the linked LedgerEntry's amount in sync, same reasoning as applySaleEdit. Refuses to edit an expense created from a Purchase Order payment — PurchaseOrder.amountPaid isn't recalculated from its linked expenses, so changing one here would silently desync how much is recorded as paid. */
async function applyExpenseEdit(id: string, data: Prisma.JsonObject, session: SessionPayload) {
  const expense = await db.expense.findUniqueOrThrow({ where: { id } });
  if (expense.purchaseOrderId) {
    throw new Error("This expense was created from a Purchase Order payment and can't be edited here.");
  }
  const { amount: rawAmount, ...rest } = data;
  const amount = typeof rawAmount === "number" ? rawAmount : expense.amount;
  const category = typeof rest.category === "string" ? rest.category : expense.category;
  const description = typeof rest.description === "string" ? rest.description : expense.description;
  const date = typeof rest.date === "string" ? new Date(rest.date) : expense.date;

  await db.$transaction(async (tx) => {
    await tx.expense.update({ where: { id }, data: { ...(rest as Prisma.ExpenseUpdateInput), amount } });
    await tx.ledgerEntry.updateMany({ where: { expenseId: id }, data: { amount } });
    await repostExpenseJournalEntry(session, { id, category, description, amount, branchId: expense.branchId, date }, tx);
  });
}

const PERFORMERS: Record<EditableEntityType, (id: string, data: Prisma.JsonObject, session: SessionPayload) => Promise<void>> = {
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
  EXPENSE: applyExpenseEdit,
  BROKER: async (id, data) => {
    await db.broker.update({ where: { id }, data: data as Prisma.BrokerUpdateInput });
  },
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

  const appliesImmediately =
    session.roles.includes("OWNER") || (session.roles.includes("ADMIN") && ADMIN_DIRECT_ENTITY_TYPES.has(entityType));
  if (appliesImmediately) {
    await PERFORMERS[entityType](entityId, proposedData, session);
    return { status: "applied" };
  }

  await db.editRequest.create({
    data: { entityType, entityId, entityLabel, fieldSummary, proposedData, reason, requestedById: session.staffId },
  });
  await notifyReviewers(
    entityType,
    "Edit awaiting approval",
    `${session.name} wants to update ${entityLabel} — ${fieldSummary}`,
    "/edit-requests",
  );
  return { status: "requested" };
}

/** Lets the person who made a pending request withdraw it themselves, instead of being stuck waiting on an Owner who may never review it (e.g. they changed their mind, or made a mistake). */
export async function cancelEditRequest(session: SessionPayload, requestId: string) {
  const request = await db.editRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "PENDING") throw new Error("This request has already been reviewed.");
  if (request.requestedById !== session.staffId) throw new Error("You can only cancel your own request.");

  await db.editRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", reviewedById: session.staffId, reviewedAt: new Date() },
  });
}

export async function reviewEditRequest(session: SessionPayload, requestId: string, decision: "APPROVED" | "REJECTED") {
  const request = await db.editRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "PENDING") throw new Error("This request has already been reviewed.");
  if (request.requestedById === session.staffId) {
    throw new Error("You can't approve or reject your own request — ask another Owner to review it.");
  }
  // Admin may review Customer requests; every other entity type stays Owner-only, checked
  // here (not just in the page that lists these) so this can't be reached by guessing a URL.
  const canReview =
    session.roles.includes("OWNER") ||
    (session.roles.includes("ADMIN") && ADMIN_DIRECT_ENTITY_TYPES.has(request.entityType as EditableEntityType));
  if (!canReview) throw new Error("Forbidden");

  if (decision === "APPROVED") {
    await PERFORMERS[request.entityType as EditableEntityType](
      request.entityId,
      request.proposedData as Prisma.JsonObject,
      session,
    );
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
