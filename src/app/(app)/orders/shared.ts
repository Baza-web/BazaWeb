import type { OrderStatus, OrderDelayReason, SaleUrgency } from "@prisma/client";

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  NEW_ORDER: "bg-stone-100 text-stone-600",
  PENDING_ASSIGNMENT: "bg-stone-100 text-stone-600",
  ORDER_CONFIRMED: "bg-blue-100 text-blue-700",
  ASSIGNED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  WAITING_FOR_MATERIALS: "bg-amber-100 text-amber-700",
  IN_PRODUCTION: "bg-amber-100 text-amber-700",
  QUALITY_CHECK: "bg-purple-100 text-purple-700",
  REVISION_REQUIRED: "bg-red-100 text-red-700",
  APPROVED: "bg-green-100 text-green-700",
  READY_FOR_DELIVERY: "bg-green-100 text-green-700",
  DISPATCHED: "bg-blue-100 text-blue-700",
  DELIVERED: "bg-green-100 text-green-700",
  COMPLETED: "bg-green-600 text-white",
  ON_HOLD: "bg-stone-200 text-stone-600",
  CANCELLED: "bg-stone-100 text-stone-400",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW_ORDER: "New Order",
  PENDING_ASSIGNMENT: "Pending Assignment",
  ORDER_CONFIRMED: "Order Confirmed",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_MATERIALS: "Waiting for Materials",
  IN_PRODUCTION: "In Production",
  QUALITY_CHECK: "Quality Check",
  REVISION_REQUIRED: "Revision Required",
  APPROVED: "Approved",
  READY_FOR_DELIVERY: "Ready for Delivery",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  ON_HOLD: "On Hold",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_OPTIONS: OrderStatus[] = [
  "NEW_ORDER", "PENDING_ASSIGNMENT", "ORDER_CONFIRMED", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_MATERIALS",
  "IN_PRODUCTION", "QUALITY_CHECK", "REVISION_REQUIRED", "APPROVED", "READY_FOR_DELIVERY",
  "DISPATCHED", "DELIVERED", "COMPLETED", "ON_HOLD", "CANCELLED",
];

export const SALE_URGENCY_LABELS: Record<SaleUrgency, string> = {
  NORMAL: "Normal",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
  CRITICAL: "Critical",
};

export const SALE_URGENCY_STYLES: Record<SaleUrgency, string> = {
  NORMAL: "bg-stone-100 text-stone-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-amber-100 text-amber-700",
  URGENT: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

export const SALE_URGENCY_OPTIONS: SaleUrgency[] = ["NORMAL", "MEDIUM", "HIGH", "URGENT", "CRITICAL"];

export const DELAY_REASON_LABELS: Record<OrderDelayReason, string> = {
  WAITING_FOR_MATERIALS: "Waiting for Materials",
  SUPPLIER_DELAY: "Supplier Delay",
  PRODUCTION_DELAY: "Production Delay",
  DESIGN_APPROVAL_PENDING: "Design Approval Pending",
  CUSTOMER_CHANGES: "Customer Changes",
  QUALITY_CONTROL_ISSUE: "Quality Control Issue",
  STAFF_AVAILABILITY: "Staff Availability",
  OTHER: "Other",
};

export const DELAY_REASON_OPTIONS: OrderDelayReason[] = [
  "WAITING_FOR_MATERIALS", "SUPPLIER_DELAY", "PRODUCTION_DELAY", "DESIGN_APPROVAL_PENDING",
  "CUSTOMER_CHANGES", "QUALITY_CONTROL_ISSUE", "STAFF_AVAILABILITY", "OTHER",
];
