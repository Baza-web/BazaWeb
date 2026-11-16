import "server-only";
import { db } from "./db";
import type { SessionPayload } from "./auth";
import { notifyStaff } from "./notifications";

export type DeletableEntityType = "STAFF" | "INVENTORY" | "SALE";

async function notifyOwners(title: string, body: string, link: string) {
  const owners = await db.staff.findMany({ where: { role: "OWNER", active: true } });
  await Promise.all(owners.map((o) => notifyStaff(o.id, "SYSTEM", title, body, link)));
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
async function performSaleDeletion(entityId: string) {
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
    await tx.sale.delete({ where: { id: entityId } });
  });
}

const PERFORMERS: Record<DeletableEntityType, (id: string) => Promise<void>> = {
  STAFF: performStaffDeletion,
  INVENTORY: performInventoryDeletion,
  SALE: performSaleDeletion,
};

async function assertNoPendingRequest(entityType: DeletableEntityType, entityId: string) {
  const existing = await db.deletionRequest.findFirst({ where: { entityType, entityId, status: "PENDING" } });
  if (existing) throw new Error("A deletion request for this is already pending Owner review.");
}

/** Owner deletes immediately. Admin can only request it — a different Owner must approve. */
export async function initiateDeletion(
  session: SessionPayload,
  entityType: DeletableEntityType,
  entityId: string,
  entityLabel: string,
  reason?: string,
): Promise<{ status: "deleted" | "requested" }> {
  await assertNoPendingRequest(entityType, entityId);

  if (session.role === "OWNER") {
    await PERFORMERS[entityType](entityId);
    return { status: "deleted" };
  }

  await db.deletionRequest.create({
    data: { entityType, entityId, entityLabel, reason, requestedById: session.staffId },
  });
  await notifyOwners(
    "Deletion awaiting approval",
    `${session.name} wants to permanently delete ${entityLabel}`,
    "/deletion-requests",
  );
  return { status: "requested" };
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

  if (decision === "APPROVED") {
    await PERFORMERS[request.entityType as DeletableEntityType](request.entityId);
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
