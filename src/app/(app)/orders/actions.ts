"use server";

import crypto from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageOrdersScoped, canManageOrdersCompanyWide, canCreateOrders, isCompanyWide } from "@/lib/rbac";
import { saveUploadedImages } from "@/lib/uploads";
import { notifyStaff } from "@/lib/notifications";
import { assertDispatchAllowed } from "@/lib/qc";
import type { OrderStatus, OrderApprovalDecision } from "@prisma/client";

function orderNumber() {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ORD-${Date.now().toString(36).toUpperCase()}-${random}`;
}

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

const numOrUndef = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.number().optional(),
);

const RESTRICTED_STATUSES: OrderStatus[] = ["APPROVED", "ON_HOLD", "CANCELLED"];

async function requireOrderAccess(orderId: string, session: Awaited<ReturnType<typeof requireSessionOrRedirect>>) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { supportingStaff: true },
  });
  const isAssigned = order.primaryStaffId === session.staffId || order.supportingStaff.some((s) => s.id === session.staffId);
  const canManage = canManageOrdersScoped(session.role);
  if (!canManage && !isAssigned) throw new Error("Forbidden");
  if (!isCompanyWide(session.role) && order.branchId && order.branchId !== session.branchId) throw new Error("Forbidden");
  return { order, isAssigned, canManage };
}

const orderSchema = z.object({
  brandId: z.string().optional(),
  customerId: z.string().optional(),
  customerContact: z.string().optional(),
  orderType: z.string().min(1),
  productOrService: z.string().min(1),
  description: z.string().optional(),
  specifications: z.string().optional(),
  customizationRequirements: z.string().optional(),
  quantity: numOrUndef,
  orderValue: numOrUndef,
  department: z.string().optional(),
  originalDeadline: z.coerce.date(),
  manualPriority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  branchId: z.string().optional(),
  primaryStaffId: z.string().min(1),
  internalInstructions: z.string().optional(),
  customerInstructions: z.string().optional(),
  relatedSaleId: z.string().optional(),
});

const initialStatusSchema = z
  .enum(["NEW_ORDER", "ORDER_CONFIRMED", "ASSIGNED"])
  .optional();

function parseOrderForm(formData: FormData) {
  return orderSchema.parse({
    brandId: emptyToUndefined(formData.get("brandId")),
    customerId: emptyToUndefined(formData.get("customerId")),
    customerContact: emptyToUndefined(formData.get("customerContact")),
    orderType: formData.get("orderType"),
    productOrService: formData.get("productOrService"),
    description: emptyToUndefined(formData.get("description")),
    specifications: emptyToUndefined(formData.get("specifications")),
    customizationRequirements: emptyToUndefined(formData.get("customizationRequirements")),
    quantity: formData.get("quantity"),
    orderValue: formData.get("orderValue"),
    department: emptyToUndefined(formData.get("department")),
    originalDeadline: formData.get("promisedDeadline"),
    manualPriority: emptyToUndefined(formData.get("manualPriority")),
    branchId: emptyToUndefined(formData.get("branchId")),
    primaryStaffId: formData.get("primaryStaffId"),
    internalInstructions: emptyToUndefined(formData.get("internalInstructions")),
    customerInstructions: emptyToUndefined(formData.get("customerInstructions")),
    relatedSaleId: emptyToUndefined(formData.get("relatedSaleId")),
  });
}

export async function createOrder(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canCreateOrders(session.role)) throw new Error("Forbidden");

  const parsed = parseOrderForm(formData);
  const branchId = parsed.branchId ?? (isCompanyWide(session.role) ? undefined : session.branchId ?? undefined);

  const primaryStaff = await db.staff.findFirst({ where: { id: parsed.primaryStaffId, active: true } });
  if (!primaryStaff) throw new Error("That staff member doesn't exist.");

  const supportingStaffIds = formData.getAll("supportingStaffIds").map(String).filter(Boolean);

  const referenceImageFiles = formData.getAll("referenceImages").filter((f) => f instanceof File) as File[];
  const referenceImages = await saveUploadedImages(referenceImageFiles, "orders");
  const documentFiles = formData.getAll("supportingDocuments").filter((f) => f instanceof File) as File[];
  const supportingDocuments = await saveUploadedImages(documentFiles, "orders", true);

  const initialStatus = initialStatusSchema.parse(formData.get("status")) ?? "NEW_ORDER";

  const order = await db.order.create({
    data: {
      ...parsed,
      branchId: branchId ?? null,
      currentDeadline: parsed.originalDeadline,
      status: initialStatus,
      referenceImages,
      supportingDocuments,
      createdById: session.staffId,
      supportingStaff: supportingStaffIds.length ? { connect: supportingStaffIds.map((id) => ({ id })) } : undefined,
      orderNumber: orderNumber(),
      statusHistory: {
        create: { toStatus: initialStatus, changedById: session.staffId, reason: "Order created" },
      },
    },
  });

  const notifyTargets = new Set([parsed.primaryStaffId, ...supportingStaffIds]);
  await Promise.all(
    Array.from(notifyTargets).map((staffId) =>
      notifyStaff(
        staffId,
        "ORDER_ASSIGNED",
        "New order assigned",
        `${order.orderNumber}: ${order.productOrService}`,
        `/orders/${order.id}`,
      ),
    ),
  );

  revalidatePath("/orders");
  revalidatePath("/orders/all");
  redirect(`/orders/${order.id}`);
}

export async function updateOrder(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const { order } = await requireOrderAccess(orderId, session);
  if (!canManageOrdersScoped(session.role)) throw new Error("Forbidden");

  const parsed = parseOrderForm(formData);
  const branchId = parsed.branchId ?? (isCompanyWide(session.role) ? undefined : session.branchId ?? undefined);

  const primaryStaff = await db.staff.findFirst({ where: { id: parsed.primaryStaffId, active: true } });
  if (!primaryStaff) throw new Error("That staff member doesn't exist.");

  const supportingStaffIds = formData.getAll("supportingStaffIds").map(String).filter(Boolean);

  const newRefFiles = formData.getAll("referenceImages").filter((f) => f instanceof File) as File[];
  const newRefImages = await saveUploadedImages(newRefFiles, "orders");
  const newDocFiles = formData.getAll("supportingDocuments").filter((f) => f instanceof File) as File[];
  const newDocs = await saveUploadedImages(newDocFiles, "orders", true);

  const previousPrimary = order.primaryStaffId;

  await db.order.update({
    where: { id: orderId },
    data: {
      ...parsed,
      branchId: branchId ?? null,
      referenceImages: newRefImages.length ? [...order.referenceImages, ...newRefImages] : order.referenceImages,
      supportingDocuments: newDocs.length ? [...order.supportingDocuments, ...newDocs] : order.supportingDocuments,
      supportingStaff: { set: supportingStaffIds.map((id) => ({ id })) },
    },
  });

  if (previousPrimary !== parsed.primaryStaffId) {
    await notifyStaff(
      parsed.primaryStaffId,
      "ORDER_ASSIGNED",
      "Order reassigned to you",
      `${order.orderNumber}: ${order.productOrService}`,
      `/orders/${order.id}`,
    );
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders/all");
  revalidatePath("/orders");
}

export async function changeOrderStatus(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const { order, canManage } = await requireOrderAccess(orderId, session);

  const status = z
    .enum([
      "NEW_ORDER", "ORDER_CONFIRMED", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_MATERIALS",
      "IN_PRODUCTION", "QUALITY_CHECK", "REVISION_REQUIRED", "APPROVED", "READY_FOR_DELIVERY",
      "DISPATCHED", "DELIVERED", "COMPLETED", "ON_HOLD", "CANCELLED",
    ])
    .parse(formData.get("status"));
  const reason = emptyToUndefined(formData.get("reason"));

  if (RESTRICTED_STATUSES.includes(status) && !canManage) throw new Error("Forbidden");

  if (status === "DISPATCHED") {
    const [brand, qcInspections, goldCertificates] = await Promise.all([
      order.brandId ? db.brand.findUnique({ where: { id: order.brandId } }) : Promise.resolve(null),
      db.qCInspection.findMany({ where: { orderId } }),
      db.goldCertificate.findMany({ where: { orderId } }),
    ]);
    assertDispatchAllowed({ brand }, qcInspections, goldCertificates);
  }

  await db.order.update({
    where: { id: orderId },
    data: {
      status,
      completedAt: status === "COMPLETED" ? new Date() : order.completedAt,
      cancelledAt: status === "CANCELLED" ? new Date() : order.cancelledAt,
      progressPercent: status === "COMPLETED" ? 100 : order.progressPercent,
      statusHistory: {
        create: { fromStatus: order.status, toStatus: status, reason, changedById: session.staffId },
      },
    },
  });

  if (status === "COMPLETED") {
    await notifyStaff(order.createdById, "ORDER_STATUS_CHANGED", "Order completed", `${order.orderNumber} is complete.`, `/orders/${order.id}`);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders/all");
  revalidatePath("/orders");
}

export async function updateProgress(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  await requireOrderAccess(orderId, session);

  const progressPercent = Math.max(0, Math.min(100, Number(formData.get("progressPercent")) || 0));
  await db.order.update({ where: { id: orderId }, data: { progressPercent } });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders/all");
}

export async function changeDeadline(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const { order, canManage } = await requireOrderAccess(orderId, session);
  if (!canManage) throw new Error("Forbidden");

  const newDeadline = z.coerce.date().parse(formData.get("newDeadline"));
  const reason = z.string().min(2, "A reason is required.").parse(formData.get("reason"));

  await db.order.update({
    where: { id: orderId },
    data: {
      currentDeadline: newDeadline,
      deadlineHistory: {
        create: { previousDeadline: order.currentDeadline, newDeadline, reason, changedById: session.staffId },
      },
    },
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders/all");
  revalidatePath("/orders/delayed");
  revalidatePath("/orders/upcoming");
}

const delayReasonSchema = z.enum([
  "WAITING_FOR_MATERIALS", "SUPPLIER_DELAY", "PRODUCTION_DELAY", "DESIGN_APPROVAL_PENDING",
  "CUSTOMER_CHANGES", "QUALITY_CONTROL_ISSUE", "STAFF_AVAILABILITY", "OTHER",
]);

export async function reportDelay(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const { order } = await requireOrderAccess(orderId, session);

  const reasonType = delayReasonSchema.parse(formData.get("reasonType"));
  const explanation = z.string().min(3, "Please explain the delay.").parse(formData.get("explanation"));

  await db.orderDelay.create({
    data: { orderId, reasonType, explanation, reportedById: session.staffId },
  });

  const owners = await db.staff.findMany({ where: { role: { in: ["OWNER", "ADMIN"] }, active: true } });
  await Promise.all(
    owners.map((o) =>
      notifyStaff(o.id, "ORDER_DELAY_REPORTED", "Delay reported", `${order.orderNumber}: ${explanation.slice(0, 100)}`, `/orders/${orderId}`),
    ),
  );

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders/delayed");
}

export async function addOrderComment(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  await requireOrderAccess(orderId, session);

  const body = z.string().min(1).parse(formData.get("body"));
  const photoFiles = formData.getAll("photos").filter((f) => f instanceof File) as File[];
  const photos = await saveUploadedImages(photoFiles, "orders");
  const docFiles = formData.getAll("documents").filter((f) => f instanceof File) as File[];
  const documents = await saveUploadedImages(docFiles, "orders", true);

  await db.orderComment.create({
    data: { orderId, staffId: session.staffId, body, photos, documents },
  });

  revalidatePath(`/orders/${orderId}`);
}

export async function submitForApproval(orderId: string) {
  const session = await requireSessionOrRedirect();
  const { order } = await requireOrderAccess(orderId, session);

  const approval = await db.orderApproval.create({
    data: { orderId, requestedById: session.staffId },
  });

  const managers = await db.staff.findMany({
    where: {
      active: true,
      role: { in: ["OWNER", "ADMIN", "MANAGER"] },
      ...(order.branchId && !isCompanyWide(session.role) ? { OR: [{ branchId: order.branchId }, { role: { in: ["OWNER", "ADMIN"] } }] } : {}),
    },
  });
  await Promise.all(
    managers.map((m) =>
      notifyStaff(m.id, "ORDER_APPROVAL_REQUESTED", "Order submitted for approval", `${order.orderNumber}: ${order.productOrService}`, `/orders/approvals`),
    ),
  );

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders/approvals");
}

export async function decideApproval(approvalId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageOrdersScoped(session.role)) throw new Error("Forbidden");

  const approval = await db.orderApproval.findUniqueOrThrow({ where: { id: approvalId }, include: { order: true } });
  if (!isCompanyWide(session.role) && approval.order.branchId && approval.order.branchId !== session.branchId) {
    throw new Error("Forbidden");
  }
  if (approval.decision) throw new Error("This approval was already decided.");

  const decision = z.enum(["APPROVED", "REVISION_REQUESTED", "REJECTED"]).parse(formData.get("decision")) as OrderApprovalDecision;
  const comments = emptyToUndefined(formData.get("comments"));

  const nextStatus: OrderStatus =
    decision === "APPROVED" ? "APPROVED" : decision === "REVISION_REQUESTED" ? "REVISION_REQUIRED" : approval.order.status;

  await db.$transaction([
    db.orderApproval.update({
      where: { id: approvalId },
      data: { decision, comments, reviewedById: session.staffId, reviewedAt: new Date() },
    }),
    db.order.update({
      where: { id: approval.orderId },
      data: {
        status: nextStatus,
        statusHistory: {
          create: {
            fromStatus: approval.order.status,
            toStatus: nextStatus,
            reason: `Approval ${decision.toLowerCase().replace("_", " ")}${comments ? `: ${comments}` : ""}`,
            changedById: session.staffId,
          },
        },
      },
    }),
  ]);

  await notifyStaff(
    approval.requestedById,
    "ORDER_APPROVAL_DECIDED",
    decision === "APPROVED" ? "Order approved" : decision === "REVISION_REQUESTED" ? "Revision requested" : "Order rejected",
    `${approval.order.orderNumber}${comments ? `: ${comments}` : ""}`,
    `/orders/${approval.orderId}`,
  );

  revalidatePath(`/orders/${approval.orderId}`);
  revalidatePath("/orders/approvals");
}

export async function createLinkedTask(orderId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const { order, canManage } = await requireOrderAccess(orderId, session);
  if (!canManage) throw new Error("Forbidden");

  const title = z.string().min(1).parse(formData.get("title"));
  const assignedToId = z.string().min(1).parse(formData.get("assignedToId"));
  const dueDate = emptyToUndefined(formData.get("dueDate"));

  const assignee = await db.staff.findFirst({ where: { id: assignedToId, active: true } });
  if (!assignee) throw new Error("That staff member doesn't exist.");

  await db.task.create({
    data: {
      title,
      description: `Linked to order ${order.orderNumber}: ${order.productOrService}`,
      branchId: order.branchId ?? assignee.branchId ?? session.branchId ?? "",
      assignedToId,
      assignedById: session.staffId,
      orderId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    },
  });

  await notifyStaff(assignedToId, "TASK_ASSIGNED", "New task from an order", `${order.orderNumber}: ${title}`, `/tasks`);

  revalidatePath(`/orders/${orderId}`);
}

export async function updatePrioritySettings(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageOrdersCompanyWide(session.role)) throw new Error("Forbidden");

  const criticalHours = Math.max(1, Number(formData.get("criticalHours")) || 24);
  const highHours = Math.max(criticalHours + 1, Number(formData.get("highHours")) || 48);
  const mediumDays = Math.max(1, Number(formData.get("mediumDays")) || 5);

  await db.orderPrioritySettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", criticalHours, highHours, mediumDays },
    update: { criticalHours, highHours, mediumDays },
  });

  revalidatePath("/orders");
}
