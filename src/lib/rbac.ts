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

/**
 * Every permission predicate below accepts either a single Role or the full
 * Role[] a staff member holds (their primary role + additionalRoles). Passing
 * the array gives union semantics — the staff member may do this if ANY of
 * their roles would allow it — which is how multi-role staff get the combined
 * permissions of everything they're tagged with. Pass `session.roles`, not
 * `session.role`, everywhere this is used as a real authorization gate;
 * `session.role` (singular, the primary role) stays reserved for display —
 * dashboard routing, "Manager/Sales/etc." badges, and the like.
 */
function hasAny(roles: Role | Role[], allowed: readonly Role[]) {
  const list = Array.isArray(roles) ? roles : [roles];
  return list.some((r) => allowed.includes(r));
}

export function isCompanyWide(roles: Role | Role[]) {
  return hasAny(roles, COMPANY_WIDE_ROLES);
}

export function canManageStaff(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

/** Owner/Admin manage staff everywhere; Manager manages staff within their own branch only. */
export function canManageStaffScoped(roles: Role | Role[]) {
  return hasAny(roles, STAFF_SCOPED_MANAGER_ROLES);
}

const INVENTORY_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SALES"];
const SALE_RECORDER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"];
const ACCOUNTING_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"];
const TASK_ASSIGNER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER"];

export function canManageInventory(roles: Role | Role[]) {
  return hasAny(roles, INVENTORY_MANAGER_ROLES);
}

export function canRecordSale(roles: Role | Role[]) {
  return hasAny(roles, SALE_RECORDER_ROLES);
}

export function canManageAccounting(roles: Role | Role[]) {
  return hasAny(roles, ACCOUNTING_MANAGER_ROLES);
}

/** Same audience as Accounting — business performance data. */
export function canViewReports(roles: Role | Role[]) {
  return hasAny(roles, ACCOUNTING_MANAGER_ROLES);
}

export function canAssignTasks(roles: Role | Role[]) {
  return hasAny(roles, TASK_ASSIGNER_ROLES);
}

/** Owner/Admin review leave requests company-wide; Manager reviews their own branch's requests. */
export function canReviewLeave(roles: Role | Role[]) {
  return hasAny(roles, TASK_ASSIGNER_ROLES);
}

/** Owner/Admin see attendance company-wide; Manager sees their own branch. */
export function canViewAttendance(roles: Role | Role[]) {
  return hasAny(roles, TASK_ASSIGNER_ROLES);
}

const REPAIR_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SALES"];

/** Owner/Admin/Manager/Sales can intake and manage repair & custom orders; Craftsman can update status on ones assigned to them. */
export function canManageRepairs(roles: Role | Role[]) {
  return hasAny(roles, REPAIR_MANAGER_ROLES);
}

/** Editing an order's core details or deleting it outright is tighter than day-to-day intake/assignment — Owner/Admin only. */
export function canEditDeleteRepairs(roles: Role | Role[]) {
  return hasAny(roles, ["OWNER", "ADMIN"]);
}

/** Same audience as Inventory — purchasing from suppliers restocks inventory. */
export function canManagePurchasing(roles: Role | Role[]) {
  return hasAny(roles, INVENTORY_MANAGER_ROLES);
}

/** Owner/Admin manage groups everywhere; Manager manages groups within their own branch. */
export function canManageGroups(roles: Role | Role[]) {
  return hasAny(roles, STAFF_SCOPED_MANAGER_ROLES);
}

/** Owner/Admin/Manager set sales targets for their team. */
export function canManageSalesTargets(roles: Role | Role[]) {
  return hasAny(roles, STAFF_SCOPED_MANAGER_ROLES);
}

/** Owner/Admin only — brokers hold valuable consignment stock, so this stays tighter than general inventory access. */
export function canManageBrokers(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

/** Owner/Admin only — the earn rate is a company-wide financial policy, same tier as adding/removing a branch. Redeeming a customer's existing balance at checkout is a routine action anyone with customer access can do (see redeemRewards). */
export function canManageRewardProgram(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

/** Owner/Admin only for now — Travel & Experiences Phase 1 has no dedicated travel roles yet (Travel Manager, Tour Guide, etc. come in later phases once booking/guide-assignment genuinely needs scoped access). */
export function canAccessTravel(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

/** Owner only — clock in/out records are the source of truth for attendance; nobody else may change them after the fact. */
export function canEditAttendance(roles: Role | Role[]) {
  return hasAny(roles, ["OWNER"]);
}

/** Owner only — adding/removing a branch outright is a bigger structural change than editing one's details (Admin can still set its geofence/main-location). */
export function canAddOrDeleteBranches(roles: Role | Role[]) {
  return hasAny(roles, ["OWNER"]);
}

/** Owner/Admin only — what an item cost the business is commercially sensitive; everyone else sees only the selling price. */
export function canViewCost(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

/** Owner/Admin only — salary and bank details are more sensitive than the rest of a staff profile, which Manager can already see/edit. */
export function canViewSalary(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

/** Owner/Admin — who may delete (directly, Owner) or request deletion of (Admin) a Staff/Inventory/Sale record. */
export function canDeleteOrRequest(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

const CUSTOMER_DELETE_ROLES: Role[] = ["OWNER", "ADMIN"];

/**
 * Owner/Admin only — any staff can add a customer, but deleting one is reserved for
 * Owner/Admin. Both apply immediately (Customer is in ADMIN_DIRECT_ENTITY_TYPES in
 * src/lib/deletion.ts) — unlike Staff/Inventory/Sale, where Admin still queues for Owner.
 */
export function canDeleteOrRequestCustomer(roles: Role | Role[]) {
  return hasAny(roles, CUSTOMER_DELETE_ROLES);
}

/**
 * Admin also reviews Customer edit/deletion requests (Owner still reviews everything).
 * Scoped narrowly to Customers — every other entity type stays Owner-only, enforced in
 * reviewEditRequest/reviewDeletionRequest themselves, not just by hiding this in the UI.
 */
export function canReviewCustomerRequests(roles: Role | Role[]) {
  return hasAny(roles, ["OWNER", "ADMIN"]);
}

const PAYROLL_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN", "ACCOUNTANT"];

/** Owner/Admin/Accountant run payroll — it needs attendance + salary data but isn't a branch-manager task. */
export function canManagePayroll(roles: Role | Role[]) {
  return hasAny(roles, PAYROLL_MANAGER_ROLES);
}

/** Owner/Admin see every creative team for planning; Creative staff see only their own team's hub. */
export function canAccessCreativeHub(roles: Role | Role[]) {
  return hasAny(roles, ["CREATIVE", ...STAFF_MANAGER_ROLES]);
}

/** Owner/Admin only — adding a house brand is a structural change, same tier as adding a branch. */
export function canManageBrands(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

/** Owner only — connecting Drive hands the app a live, reusable credential to an external account; tighter than any other integration/structural setting. */
export function canManageIntegrations(roles: Role | Role[]) {
  return hasAny(roles, ["OWNER"]);
}

/** Owner/Admin only — the sidebar order is company-wide (every role sees whatever order Owner/Admin set), so only they can rearrange it. */
export function canEditNavOrder(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

/** Everyone can open Orders Handling — the module itself scopes what each role actually sees (company-wide board vs. just "My Assigned Orders"). */
export function canAccessOrders(_roles: Role | Role[]) {
  return true;
}

/** Owner/Admin only — the company-wide Order Command Centre, All Orders board, and reports. Same tier as every other company-wide management surface. */
export function canManageOrdersCompanyWide(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

/** Owner/Admin/Manager — a Manager's access is scoped to their own branch via branchScope. Covers assignment, approvals, and deadline/priority changes. */
export function canManageOrdersScoped(roles: Role | Role[]) {
  return hasAny(roles, STAFF_SCOPED_MANAGER_ROLES);
}

const ORDER_CREATOR_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SALES"];

/** Same tier as Repairs & Custom Order intake — Sales staff are usually the ones taking a custom order from a customer. */
export function canCreateOrders(roles: Role | Role[]) {
  return hasAny(roles, ORDER_CREATOR_ROLES);
}

const QC_INSPECTOR_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "CRAFTSMAN"];

/** Who is eligible to perform a QC inspection at all — the "is this person the production staff on THIS order" independence check is separate, see requireIndependentInspector in src/lib/qc.ts. */
export function canPerformQCInspection(roles: Role | Role[]) {
  return hasAny(roles, QC_INSPECTOR_ROLES);
}

/** Owner/Admin only — the QC checklist is a compliance control, same tier as every other configurable company-wide policy. */
export function canEditQCChecklistTemplate(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

/** Owner/Admin only — verifying a gold certificate (and therefore clearing an order to dispatch) is a compliance sign-off, not a routine order action. */
export function canVerifyGoldCertificates(roles: Role | Role[]) {
  return hasAny(roles, STAFF_MANAGER_ROLES);
}

/** Owner/Admin/Manager manage the supply/tool catalog (add items, set reorder levels); same tier as Inventory/Purchasing. */
export function canManageSupplyCatalog(roles: Role | Role[]) {
  return hasAny(roles, STAFF_SCOPED_MANAGER_ROLES);
}

/** Checking a tool out/in or issuing a supply is a routine workshop action — same audience as who can actually do the work, not just who manages the catalog. */
export function canCheckOutSuppliesOrTools(roles: Role | Role[]) {
  return hasAny(roles, QC_INSPECTOR_ROLES);
}

/** Owner/Admin/Manager — same tier as Inventory/Purchasing: generating a QR that can point anywhere (including an external URL) is an operational action, not a routine floor task. */
export function canManageQRCodes(roles: Role | Role[]) {
  return hasAny(roles, STAFF_SCOPED_MANAGER_ROLES);
}

/**
 * Returns a Prisma `where` fragment that scopes a query to the caller's
 * branch unless they hold a company-wide role, in which case `branchFilter`
 * (e.g. from a dashboard dropdown) is honored verbatim.
 */
export function branchScope(session: SessionPayload, branchFilter?: string | null) {
  if (isCompanyWide(session.roles)) {
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
