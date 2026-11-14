import type { Role } from "@prisma/client";
import type { SessionPayload } from "./auth";

/** Roles that can see and act across every branch, not just their own. */
export const COMPANY_WIDE_ROLES: Role[] = ["OWNER", "ADMIN", "ACCOUNTANT"];

/** Roles allowed to manage branches company-wide. */
export const STAFF_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN"];

/** Roles allowed to manage staff accounts — Owner/Admin everywhere, Manager within their own branch. */
export const STAFF_SCOPED_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER"];

/** Roles a Branch Manager is allowed to grant — never company-wide roles, to prevent privilege escalation. */
export const MANAGER_GRANTABLE_ROLES: Role[] = ["MANAGER", "SALES", "CRAFTSMAN"];

export function isCompanyWide(role: Role) {
  return COMPANY_WIDE_ROLES.includes(role);
}

export function canManageStaff(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

/** Owner/Admin manage staff everywhere; Manager manages staff within their own branch only. */
export function canManageStaffScoped(role: Role) {
  return STAFF_SCOPED_MANAGER_ROLES.includes(role);
}

const INVENTORY_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SALES"];
const SALE_RECORDER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"];
const ACCOUNTING_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"];
const TASK_ASSIGNER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER"];

export function canManageInventory(role: Role) {
  return INVENTORY_MANAGER_ROLES.includes(role);
}

export function canRecordSale(role: Role) {
  return SALE_RECORDER_ROLES.includes(role);
}

export function canManageAccounting(role: Role) {
  return ACCOUNTING_MANAGER_ROLES.includes(role);
}

/** Same audience as Accounting — business performance data. */
export function canViewReports(role: Role) {
  return ACCOUNTING_MANAGER_ROLES.includes(role);
}

export function canAssignTasks(role: Role) {
  return TASK_ASSIGNER_ROLES.includes(role);
}

/** Owner/Admin review leave requests company-wide; Manager reviews their own branch's requests. */
export function canReviewLeave(role: Role) {
  return TASK_ASSIGNER_ROLES.includes(role);
}

/** Owner/Admin see attendance company-wide; Manager sees their own branch. */
export function canViewAttendance(role: Role) {
  return TASK_ASSIGNER_ROLES.includes(role);
}

const REPAIR_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SALES"];

/** Owner/Admin/Manager/Sales can intake and manage repair & custom orders; Craftsman can update status on ones assigned to them. */
export function canManageRepairs(role: Role) {
  return REPAIR_MANAGER_ROLES.includes(role);
}

/** Same audience as Inventory — purchasing from suppliers restocks inventory. */
export function canManagePurchasing(role: Role) {
  return INVENTORY_MANAGER_ROLES.includes(role);
}

/** Owner/Admin manage groups everywhere; Manager manages groups within their own branch. */
export function canManageGroups(role: Role) {
  return STAFF_SCOPED_MANAGER_ROLES.includes(role);
}

/** Owner/Admin/Manager set sales targets for their team. */
export function canManageSalesTargets(role: Role) {
  return STAFF_SCOPED_MANAGER_ROLES.includes(role);
}

/** Owner/Admin only — brokers hold valuable consignment stock, so this stays tighter than general inventory access. */
export function canManageBrokers(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

/** Owner only — clock in/out records are the source of truth for attendance; nobody else may change them after the fact. */
export function canEditAttendance(role: Role) {
  return role === "OWNER";
}

/** Owner only — adding/removing a branch outright is a bigger structural change than editing one's details (Admin can still set its geofence/main-location). */
export function canAddOrDeleteBranches(role: Role) {
  return role === "OWNER";
}

/**
 * Returns a Prisma `where` fragment that scopes a query to the caller's
 * branch unless they hold a company-wide role, in which case `branchFilter`
 * (e.g. from a dashboard dropdown) is honored verbatim.
 */
export function branchScope(session: SessionPayload, branchFilter?: string | null) {
  if (isCompanyWide(session.role)) {
    return branchFilter ? { branchId: branchFilter } : {};
  }
  return { branchId: session.branchId ?? "__none__" };
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Branch Manager",
  SALES: "Sales Staff",
  ACCOUNTANT: "Accountant",
  CRAFTSMAN: "Craftsman / Goldsmith",
};
