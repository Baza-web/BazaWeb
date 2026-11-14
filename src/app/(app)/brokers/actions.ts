"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect, type SessionPayload } from "@/lib/auth";
import { branchScope, canManageBrokers, isCompanyWide } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";
import { round2 } from "@/lib/utils";
import { generateBrokerStatementXlsx, brokerStatementEmailHtml } from "@/lib/brokerStatement";
import { sendEmail } from "@/lib/email";

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value);
  return s === "" ? undefined : s;
}

async function otherAdmins(session: SessionPayload) {
  return db.staff.findMany({
    where: {
      active: true,
      id: { not: session.staffId },
      role: { in: ["OWNER", "ADMIN"] },
    },
  });
}

/** Rebuilds and emails a broker's full statement (every memo item they've ever been issued). */
async function sendBrokerStatement(brokerId: string) {
  const broker = await db.broker.findUniqueOrThrow({ where: { id: brokerId } });
  if (!broker.email) return;

  const items = await db.brokerMemoItem.findMany({
    where: { memo: { brokerId } },
    include: { memo: true, inventoryItem: true },
    orderBy: { memo: { issuedAt: "desc" } },
  });

  const rows = items.map((item) => ({
    memoNumber: item.memo.memoNumber,
    issuedAt: item.memo.issuedAt,
    sku: item.inventoryItem.sku,
    itemName: item.inventoryItem.name,
    category: item.inventoryItem.category.replace("_", " "),
    quantity: item.quantity,
    returnedQuantity: item.returnedQuantity,
    valueEach: item.valueEach,
  }));

  const totalOutstandingValue = round2(
    rows.reduce((sum, r) => sum + (r.quantity - r.returnedQuantity) * r.valueEach, 0),
  );

  const xlsx = await generateBrokerStatementXlsx(broker.name, rows);

  await sendEmail({
    to: broker.email,
    subject: `Your Baza ERP memo statement — ${broker.name}`,
    html: brokerStatementEmailHtml(broker.name, totalOutstandingValue),
    attachment: { filename: `${broker.name.replace(/\s+/g, "-")}-statement.xlsx`, content: xlsx },
  });
}

const brokerSchema = z.object({
  name: z.string().min(2),
  company: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  branchId: z.string().min(1),
});

export async function createBroker(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrokers(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const parsed = brokerSchema.parse({
    name: formData.get("name"),
    company: emptyToUndefined(formData.get("company")),
    email: emptyToUndefined(formData.get("email")),
    phone: emptyToUndefined(formData.get("phone")),
    address: emptyToUndefined(formData.get("address")),
    notes: emptyToUndefined(formData.get("notes")),
    branchId,
  });

  await db.broker.create({ data: { ...parsed, createdById: session.staffId } });
  revalidatePath("/brokers");
}

const memoLineSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  valueEach: z.coerce.number().min(0),
});

const memoSchema = z.object({
  brokerId: z.string().min(1),
  branchId: z.string().min(1),
  expectedReturnAt: z.coerce.date().optional(),
  notes: z.string().optional(),
  items: z.array(memoLineSchema).min(1),
});

function memoNumber() {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `MEMO-${Date.now().toString(36).toUpperCase()}-${random}`;
}

export async function createMemo(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrokers(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const rawItems = JSON.parse(String(formData.get("itemsJson") || "[]"));

  const parsed = memoSchema.parse({
    brokerId: formData.get("brokerId"),
    branchId,
    expectedReturnAt: formData.get("expectedReturnAt") || undefined,
    notes: emptyToUndefined(formData.get("notes")),
    items: rawItems,
  });

  const itemIds = parsed.items.map((i) => i.inventoryItemId);
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("The same item appears more than once on this memo — combine it into a single line.");
  }

  const broker = await db.broker.findFirst({ where: { id: parsed.brokerId, branchId: parsed.branchId } });
  if (!broker) throw new Error("That broker does not belong to this branch.");

  const inventoryItems = await db.inventoryItem.findMany({
    where: { id: { in: itemIds }, branchId: parsed.branchId, status: "IN_STOCK" },
  });
  for (const line of parsed.items) {
    const inv = inventoryItems.find((i) => i.id === line.inventoryItemId);
    if (!inv) throw new Error("One of the selected items is no longer available in this branch.");
    if (inv.quantity < line.quantity) throw new Error(`Not enough stock of ${inv.name} to issue on memo.`);
  }

  await db.$transaction(async (tx) => {
    const memo = await tx.brokerMemo.create({
      data: {
        memoNumber: memoNumber(),
        brokerId: parsed.brokerId,
        branchId: parsed.branchId,
        expectedReturnAt: parsed.expectedReturnAt,
        notes: parsed.notes,
        createdById: session.staffId,
        items: {
          create: parsed.items.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
            valueEach: line.valueEach,
          })),
        },
      },
    });

    for (const line of parsed.items) {
      const result = await tx.inventoryItem.updateMany({
        where: {
          id: line.inventoryItemId,
          branchId: parsed.branchId,
          status: "IN_STOCK",
          quantity: { gte: line.quantity },
        },
        data: { quantity: { decrement: line.quantity } },
      });
      if (result.count !== 1) {
        throw new Error("Not enough stock — someone else may have just taken it.");
      }
      const updated = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.inventoryItemId } });
      if (updated.quantity <= 0) {
        await tx.inventoryItem.update({ where: { id: line.inventoryItemId }, data: { status: "CONSIGNMENT" } });
      }
    }

    return memo;
  });

  const admins = await otherAdmins(session);
  await Promise.all(
    admins.map((a) =>
      notifyStaff(a.id, "SYSTEM", "New broker memo issued", `${session.name} issued a memo to ${broker.name}.`, "/brokers"),
    ),
  );

  await sendBrokerStatement(parsed.brokerId).catch((err) => console.error("Failed to email broker statement:", err));

  revalidatePath("/brokers");
  revalidatePath("/inventory");
}

const editRequestSchema = z.object({
  itemReturns: z.array(z.object({ memoItemId: z.string().min(1), returnQuantity: z.coerce.number().int().min(0) })),
  notesChange: z.string().optional(),
  reason: z.string().optional(),
});

export async function requestMemoEdit(memoId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrokers(session.role)) throw new Error("Forbidden");

  const memo = await db.brokerMemo.findFirst({
    where: { id: memoId, ...branchScope(session) },
    include: { items: true, broker: true },
  });
  if (!memo) throw new Error("Forbidden");

  const rawReturns = JSON.parse(String(formData.get("itemReturnsJson") || "[]"));
  const parsed = editRequestSchema.parse({
    itemReturns: rawReturns,
    notesChange: emptyToUndefined(formData.get("notesChange")),
    reason: emptyToUndefined(formData.get("reason")),
  });

  for (const r of parsed.itemReturns) {
    const item = memo.items.find((i) => i.id === r.memoItemId);
    if (!item) throw new Error("That item is not on this memo.");
    const maxReturnable = item.quantity - item.returnedQuantity;
    if (r.returnQuantity > maxReturnable) {
      throw new Error(`Cannot return more than the ${maxReturnable} still outstanding.`);
    }
  }

  const hasChange = parsed.itemReturns.some((r) => r.returnQuantity > 0) || parsed.notesChange !== undefined;
  if (!hasChange) throw new Error("Nothing to change.");

  await db.brokerMemoEditRequest.create({
    data: {
      memoId,
      itemReturns: parsed.itemReturns,
      notesChange: parsed.notesChange,
      reason: parsed.reason,
      requestedById: session.staffId,
    },
  });

  const admins = await otherAdmins(session);
  await Promise.all(
    admins.map((a) =>
      notifyStaff(
        a.id,
        "MEMO_EDIT_REQUESTED",
        "Memo edit needs approval",
        `${session.name} proposed a change to ${memo.memoNumber} (${memo.broker.name}).`,
        "/brokers",
      ),
    ),
  );

  revalidatePath(`/brokers/${memo.brokerId}`);
}

const decisionSchema = z.enum(["APPROVED", "REJECTED"]);

export async function reviewMemoEditRequest(requestId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrokers(session.role)) throw new Error("Forbidden");

  const request = await db.brokerMemoEditRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { memo: { include: { items: true, broker: true } } },
  });
  if (!isCompanyWide(session.role) && request.memo.branchId !== session.branchId) throw new Error("Forbidden");
  if (request.status !== "PENDING") throw new Error("This request has already been reviewed.");
  if (request.requestedById === session.staffId) {
    throw new Error("You can't approve or reject your own request — ask another Owner/Admin to review it.");
  }

  const decision = decisionSchema.parse(formData.get("decision"));

  if (decision === "REJECTED") {
    await db.brokerMemoEditRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED", reviewedById: session.staffId, reviewedAt: new Date() },
    });
  } else {
    const itemReturns = request.itemReturns as { memoItemId: string; returnQuantity: number }[];

    await db.$transaction(async (tx) => {
      for (const r of itemReturns) {
        if (r.returnQuantity <= 0) continue;
        const item = request.memo.items.find((i) => i.id === r.memoItemId);
        if (!item) continue;

        await tx.brokerMemoItem.update({
          where: { id: r.memoItemId },
          data: { returnedQuantity: { increment: r.returnQuantity } },
        });

        const invItem = await tx.inventoryItem.findUniqueOrThrow({ where: { id: item.inventoryItemId } });
        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: {
            quantity: { increment: r.returnQuantity },
            status: invItem.status === "CONSIGNMENT" ? "IN_STOCK" : invItem.status,
          },
        });
      }

      const updatedItems = await tx.brokerMemoItem.findMany({ where: { memoId: request.memoId } });
      const totalTaken = updatedItems.reduce((s, i) => s + i.quantity, 0);
      const totalReturned = updatedItems.reduce((s, i) => s + i.returnedQuantity, 0);
      const newStatus = totalReturned === 0 ? "OPEN" : totalReturned < totalTaken ? "PARTIALLY_RETURNED" : "RETURNED";

      await tx.brokerMemo.update({
        where: { id: request.memoId },
        data: {
          status: newStatus,
          notes: request.notesChange !== null ? request.notesChange ?? undefined : undefined,
        },
      });

      await tx.brokerMemoEditRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED", reviewedById: session.staffId, reviewedAt: new Date() },
      });
    });

    await sendBrokerStatement(request.memo.brokerId).catch((err) =>
      console.error("Failed to email broker statement:", err),
    );
  }

  await notifyStaff(
    request.requestedById,
    "MEMO_EDIT_DECIDED",
    `Memo edit ${decision.toLowerCase()}`,
    `${session.name} ${decision === "APPROVED" ? "approved" : "rejected"} your proposed change to ${request.memo.memoNumber}.`,
    "/brokers",
  );

  revalidatePath(`/brokers/${request.memo.brokerId}`);
  revalidatePath("/inventory");
}

export async function resendBrokerStatement(brokerId: string, _formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageBrokers(session.role)) throw new Error("Forbidden");

  const broker = await db.broker.findFirst({ where: { id: brokerId, ...branchScope(session) } });
  if (!broker) throw new Error("Forbidden");
  if (!broker.email) throw new Error("This broker has no email address on file.");

  await sendBrokerStatement(brokerId);
}
