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

/** Roles an Admin is allowed to grant when changing someone's role — everything except Owner, so an Admin can never mint a new Owner-level account. Only an existing Owner can do that. */
export const ADMIN_GRANTABLE_ROLES: Role[] = ["ADMIN", "MANAGER", "SALES", "ACCOUNTANT", "CRAFTSMAN", "CREATIVE"];

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

/** Editing an order's core details or deleting it outright is tighter than day-to-day intake/assignment — Owner/Admin only. */
export function canEditDeleteRepairs(role: Role) {
  return role === "OWNER" || role === "ADMIN";
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

/** Owner/Admin only — the earn rate is a company-wide financial policy, same tier as adding/removing a branch. Redeeming a customer's existing balance at checkout is a routine action anyone with customer access can do (see redeemRewards). */
export function canManageRewardProgram(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

/** Owner/Admin only for now — Travel & Experiences Phase 1 has no dedicated travel roles yet (Travel Manager, Tour Guide, etc. come in later phases once booking/guide-assignment genuinely needs scoped access). */
export function canAccessTravel(role: Role) {
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

/** Owner/Admin only — what an item cost the business is commercially sensitive; everyone else sees only the selling price. */
export function canViewCost(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

/** Owner/Admin only — salary and bank details are more sensitive than the rest of a staff profile, which Manager can already see/edit. */
export function canViewSalary(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

/** Owner/Admin — who may delete (directly, Owner) or request deletion of (Admin) a Staff/Inventory/Sale record. */
export function canDeleteOrRequest(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

const CUSTOMER_DELETE_ROLES: Role[] = ["OWNER", "ADMIN", "SALES"];

/**
 * Customers specifically also let Sales staff request a deletion — unlike every other
 * record type above (Staff/Inventory/Sale), which stays Owner/Admin-only. Owner and
 * Admin both delete a customer immediately; Sales always goes through a request.
 */
export function canDeleteOrRequestCustomer(role: Role) {
  return CUSTOMER_DELETE_ROLES.includes(role);
}

/**
 * Admin also reviews Customer edit/deletion requests (Owner still reviews everything).
 * Scoped narrowly to Customers — every other entity type stays Owner-only, enforced in
 * reviewEditRequest/reviewDeletionRequest themselves, not just by hiding this in the UI.
 */
export function canReviewCustomerRequests(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

const PAYROLL_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN", "ACCOUNTANT"];

/** Owner/Admin/Accountant run payroll — it needs attendance + salary data but isn't a branch-manager task. */
export function canManagePayroll(role: Role) {
  return PAYROLL_MANAGER_ROLES.includes(role);
}

/** Owner/Admin see every creative team for planning; Creative staff see only their own team's hub. */
export function canAccessCreativeHub(role: Role) {
  return role === "CREATIVE" || STAFF_MANAGER_ROLES.includes(role);
}

/** Owner/Admin only — adding a house brand is a structural change, same tier as adding a branch. */
export function canManageBrands(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

/** Owner only — connecting Drive hands the app a live, reusable credential to an external account; tighter than any other integration/structural setting. */
export function canManageIntegrations(role: Role) {
  return role === "OWNER";
}

/** Owner/Admin only — the sidebar order is company-wide (every role sees whatever order Owner/Admin set), so only they can rearrange it. */
export function canEditNavOrder(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

/** Everyone can open Orders Handling — the module itself scopes what each role actually sees (company-wide board vs. just "My Assigned Orders"). */
export function canAccessOrders(_role: Role) {
  return true;
}

/** Owner/Admin only — the company-wide Order Command Centre, All Orders board, and reports. Same tier as every other company-wide management surface. */
export function canManageOrdersCompanyWide(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

/** Owner/Admin/Manager — a Manager's access is scoped to their own branch via branchScope. Covers assignment, approvals, and deadline/priority changes. */
export function canManageOrdersScoped(role: Role) {
  return STAFF_SCOPED_MANAGER_ROLES.includes(role);
}

const ORDER_CREATOR_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SALES"];

/** Same tier as Repairs & Custom Order intake — Sales staff are usually the ones taking a custom order from a customer. */
export function canCreateOrders(role: Role) {
  return ORDER_CREATOR_ROLES.includes(role);
}

const QC_INSPECTOR_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "CRAFTSMAN"];

/** Who is eligible to perform a QC inspection at all — the "is this person the production staff on THIS order" independence check is separate, see requireIndependentInspector in src/lib/qc.ts. */
export function canPerformQCInspection(role: Role) {
  return QC_INSPECTOR_ROLES.includes(role);
}

/** Owner/Admin only — the QC checklist is a compliance control, same tier as every other configurable company-wide policy. */
export function canEditQCChecklistTemplate(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

/** Owner/Admin only — verifying a gold certificate (and therefore clearing an order to dispatch) is a compliance sign-off, not a routine order action. */
export function canVerifyGoldCertificates(role: Role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

/** Owner/Admin/Manager manage the supply/tool catalog (add items, set reorder levels); same tier as Inventory/Purchasing. */
export function canManageSupplyCatalog(role: Role) {
  return STAFF_SCOPED_MANAGER_ROLES.includes(role);
}

/** Checking a tool out/in or issuing a supply is a routine workshop action — same audience as who can actually do the work, not just who manages the catalog. */
export function canCheckOutSuppliesOrTools(role: Role) {
  return QC_INSPECTOR_ROLES.includes(role);
}

/** Owner/Admin/Manager — same tier as Inventory/Purchasing: generating a QR that can point anywhere (including an external URL) is an operational action, not a routine floor task. */
export function canManageQRCodes(role: Role) {
  return STAFF_SCOPED_MANAGER_ROLES.includes(role);
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
  CREATIVE: "Creative",
};
