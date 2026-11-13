import type { Role } from "@prisma/client";
import type { SessionPayload } from "./auth";

/** Roles that can see and act across every branch, not just their own. */
export const COMPANY_WIDE_ROLES: Role[] = ["OWNER", "ADMIN", "ACCOUNTANT"];

/** Roles allowed to manage staff accounts and branches. */
export const STAFF_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN"];

export function isCompanyWide(role: Role) {
  return COMPANY_WIDE_ROLES.includes(role);
}

export function canManageStaff(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

const INVENTORY_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SALES"];
const SALE_RECORDER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SALES"];
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

export function canAssignTasks(role: Role) {
  return TASK_ASSIGNER_ROLES.includes(role);
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
