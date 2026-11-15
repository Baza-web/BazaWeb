import "server-only";
import { db } from "./db";
import type { SessionPayload } from "./auth";
import type { Prisma } from "@prisma/client";

export type EditableEntityType = "STAFF" | "INVENTORY";

const PERFORMERS: Record<EditableEntityType, (id: string, data: Prisma.JsonObject) => Promise<void>> = {
  STAFF: async (id, data) => {
    await db.staff.update({ where: { id }, data: data as Prisma.StaffUpdateInput });
  },
  INVENTORY: async (id, data) => {
    await db.inventoryItem.update({ where: { id }, data: data as Prisma.InventoryItemUpdateInput });
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

  if (session.role === "OWNER") {
    await PERFORMERS[entityType](entityId, proposedData);
    return { status: "applied" };
  }

  await db.editRequest.create({
    data: { entityType, entityId, entityLabel, fieldSummary, proposedData, reason, requestedById: session.staffId },
  });
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
}
