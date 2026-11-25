import "server-only";
import { db } from "./db";
import type { SessionPayload } from "./auth";
import { notifyStaff } from "./notifications";
import { reverseSaleJournalEntry, reverseExpenseJournalEntry } from "./ledger";
import { reverseRewardsForSale } from "./rewards";

export type DeletableEntityType = "STAFF" | "INVENTORY" | "SALE" | "CUSTOMER" | "EXPENSE" | "BROKER" | "BRAND";

/** Customer and Brand requests also notify Admins, since Admin can review those too (every other entity type stays Owner-only). */
const ADMIN_DIRECT_ENTITY_TYPES = new Set<DeletableEntityType>(["CUSTOMER", "BRAND"]);

async function notifyReviewers(entityType: DeletableEntityType, title: string, body: string, link: string) {
  const roles = ADMIN_DIRECT_ENTITY_TYPES.has(entityType) ? (["OWNER", "ADMIN"] as const) : (["OWNER"] as const);
  const reviewers = await db.staff.findMany({ where: { role: { in: [...roles] }, active: true } });
  await Promise.all(reviewers.map((r) => notifyStaff(r.id, "SYSTEM", title, body, link)));
}

/**
 * Staff are never hard-deleted from the database — their historical sales,
 * attendance, tasks, and expenses all reference them, and erasing the row
 * would either break that history or require deleting it too. "Permanently
 * delete" here means: wipe every personal/login detail, free up the email,
 * and hide them from every staff list — while the (now-anonymous) row stays
 * just long enough to keep old records attributable.
 */
async function performStaffDeletion(entityId: string) {
  const staff = await db.staff.findUniqueOrThrow({ where: { id: entityId } });
  if (staff.deletedAt) return; // already deleted
  await db.staff.update({
    where: { id: entityId },
    data: {
      name: "[Deleted staff]",
      email: `deleted-${entityId}@deleted.invalid`,
      phone: null,
      passwordHash: "deleted",
      active: false,
      deletedAt: new Date(),
      nic: null,
      dateOfBirth: null,
      address: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      bankName: null,
      bankAccountNumber: null,
      bankBranch: null,
      baseSalary: null,
      documents: [],
    },
  });
}

/** Refuses to delete an item that still has sale, memo, or repair history — that's real business data, never silently cascaded away. */
async function performInventoryDeletion(entityId: string) {
  const [saleItemCount, memoItemCount, repairCount] = await Promise.all([
    db.saleItem.count({ where: { inventoryItemId: entityId } }),
    db.brokerMemoItem.count({ where: { inventoryItemId: entityId } }),
    db.repairOrder.count({ where: { relatedInventoryItemId: entityId } }),
  ]);
  if (saleItemCount + memoItemCount + repairCount > 0) {
    throw new Error(
      "This item has sale, memo, or repair history and can't be deleted — change its status instead if it's no longer available.",
    );
  }
  await db.inventoryItem.delete({ where: { id: entityId } });
}

/** Voiding a sale restores the stock it sold and removes its ledger entry, then deletes the sale itself (its line items cascade). */
async function performSaleDeletion(entityId: string, session: SessionPayload) {
  const sale = await db.sale.findUniqueOrThrow({ where: { id: entityId }, include: { items: true } });
  await db.$transaction(async (tx) => {
    for (const item of sale.items) {
      const updated = await tx.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { quantity: { increment: item.quantity } },
      });
      if (updated.status === "SOLD" && updated.quantity > 0) {
        await tx.inventoryItem.update({ where: { id: item.inventoryItemId }, data: { status: "IN_STOCK" } });
      }
    }
    await tx.ledgerEntry.deleteMany({ where: { saleId: entityId } });
    await reverseSaleJournalEntry(session, entityId, tx);
    await reverseRewardsForSale(entityId, tx);
    await tx.sale.delete({ where: { id: entityId } });
  });
}

/** Refuses to delete a customer with real purchase or repair history — that's business data, never silently cascaded away. */
async function performCustomerDeletion(entityId: string) {
  const [saleCount, repairCount] = await Promise.all([
    db.sale.count({ where: { customerId: entityId } }),
    db.repairOrder.count({ where: { customerId: entityId } }),
  ]);
  if (saleCount + repairCount > 0) {
    throw new Error("This customer has sales or repair history and can't be deleted.");
  }
  await db.$transaction([
    db.customerNote.deleteMany({ where: { customerId: entityId } }),
    db.emailLog.deleteMany({ where: { customerId: entityId } }),
    db.customer.delete({ where: { id: entityId } }),
  ]);
}

/** Refuses to delete an expense created from a Purchase Order payment — PurchaseOrder.amountPaid is a running total that isn't recalculated from its linked expenses, so removing one here would silently overstate how much is still owed. */
async function performExpenseDeletion(entityId: string, session: SessionPayload) {
  const expense = await db.expense.findUniqueOrThrow({ where: { id: entityId } });
  if (expense.purchaseOrderId) {
    throw new Error("This expense was created from a Purchase Order payment and can't be deleted here.");
  }
  await db.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({ where: { expenseId: entityId } });
    await reverseExpenseJournalEntry(session, entityId, tx);
    await tx.expense.delete({ where: { id: entityId } });
  });
}

/** Refuses to delete a broker with any memo history — consignment stock may still be outstanding against them. */
async function performBrokerDeletion(entityId: string) {
  const memoCount = await db.brokerMemo.count({ where: { brokerId: entityId } });
  if (memoCount > 0) {
    throw new Error("This broker has memo history and can't be deleted — mark them inactive instead if they're no longer active.");
  }
  await db.broker.delete({ where: { id: entityId } });
}

/** Refuses to delete a brand that any staff, social post, sale, expense, inventory item, or order is still attributed to — that's real business and compliance history, never silently detached or cascaded away. Deactivate it instead if it's no longer trading. */
async function performBrandDeletion(entityId: string) {
  const brand = await db.brand.findUniqueOrThrow({
    where: { id: entityId },
    include: {
      _count: { select: { staff: true, socialPosts: true, sales: true, expenses: true, inventoryItems: true, orders: true } },
      project: { include: { _count: { select: { tasks: true } } } },
    },
  });
  if (Object.values(brand._count).some((n) => n > 0) || (brand.project?._count.tasks ?? 0) > 0) {
    throw new Error("This brand is still in use (staff, posts, sales, expenses, inventory, orders, or project tasks reference it) and can't be deleted — deactivate it instead.");
  }
  // Delete the brand's matching project first (it's now confirmed task-free above) —
  // Project.brandId has no cascade, so it would otherwise block the brand's own delete.
  if (brand.project) {
    await db.project.delete({ where: { id: brand.project.id } });
  }
  await db.brand.delete({ where: { id: entityId } });
}

const PERFORMERS: Record<DeletableEntityType, (id: string, session: SessionPayload) => Promise<void>> = {
  STAFF: performStaffDeletion,
  INVENTORY: performInventoryDeletion,
  SALE: performSaleDeletion,
  CUSTOMER: performCustomerDeletion,
  EXPENSE: performExpenseDeletion,
  BROKER: performBrokerDeletion,
  BRAND: performBrandDeletion,
};

async function assertNoPendingRequest(entityType: DeletableEntityType, entityId: string) {
  const existing = await db.deletionRequest.findFirst({ where: { entityType, entityId, status: "PENDING" } });
  if (existing) throw new Error("A deletion request for this is already pending Owner review.");
}

/**
 * Owner deletes immediately for any entity type. Admin also deletes immediately for a Customer
 * or a Brand — every other entity type still queues for a different Owner to approve.
 */
export async function initiateDeletion(
  session: SessionPayload,
  entityType: DeletableEntityType,
  entityId: string,
  entityLabel: string,
  reason?: string,
): Promise<{ status: "deleted" | "requested" }> {
  await assertNoPendingRequest(entityType, entityId);

  const appliesImmediately =
    session.roles.includes("OWNER") || (session.roles.includes("ADMIN") && ADMIN_DIRECT_ENTITY_TYPES.has(entityType));
  if (appliesImmediately) {
    await PERFORMERS[entityType](entityId, session);
    return { status: "deleted" };
  }

  await db.deletionRequest.create({
    data: { entityType, entityId, entityLabel, reason, requestedById: session.staffId },
  });
  await notifyReviewers(
    entityType,
    "Deletion awaiting approval",
    `${session.name} wants to permanently delete ${entityLabel}`,
    "/deletion-requests",
  );
  return { status: "requested" };
}

/** Lets the person who made a pending deletion request withdraw it themselves, instead of being stuck waiting on an Owner who may never review it. */
export async function cancelDeletionRequest(session: SessionPayload, requestId: string) {
  const request = await db.deletionRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "PENDING") throw new Error("This request has already been reviewed.");
  if (request.requestedById !== session.staffId) throw new Error("You can only cancel your own request.");

  await db.deletionRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", reviewedById: session.staffId, reviewedAt: new Date() },
  });
}

export async function reviewDeletionRequest(
  session: SessionPayload,
  requestId: string,
  decision: "APPROVED" | "REJECTED",
) {
  const request = await db.deletionRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status !== "PENDING") throw new Error("This request has already been reviewed.");
  if (request.requestedById === session.staffId) {
    throw new Error("You can't approve or reject your own request — ask another Owner to review it.");
  }
  // Admin may review Customer or Brand requests; every other entity type stays Owner-only,
  // checked here (not just in the page that lists these) so this can't be reached by guessing a URL.
  const canReview =
    session.roles.includes("OWNER") ||
    (session.roles.includes("ADMIN") && ADMIN_DIRECT_ENTITY_TYPES.has(request.entityType as DeletableEntityType));
  if (!canReview) throw new Error("Forbidden");

  if (decision === "APPROVED") {
    await PERFORMERS[request.entityType as DeletableEntityType](request.entityId, session);
  }
  await db.deletionRequest.update({
    where: { id: requestId },
    data: { status: decision, reviewedById: session.staffId, reviewedAt: new Date() },
  });
  await notifyStaff(
    request.requestedById,
    "SYSTEM",
    decision === "APPROVED" ? "Your deletion was approved" : "Your deletion was rejected",
    `${session.name} ${decision === "APPROVED" ? "approved" : "rejected"} your request to delete ${request.entityLabel}`,
    "/deletion-requests",
  );
}
