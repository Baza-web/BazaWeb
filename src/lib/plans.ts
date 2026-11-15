/**
 * The single source of truth for what each billing plan includes. Change
 * the LITE_MODULES/FULL_MODULES lists below to change what a plan unlocks —
 * nothing else in the app hardcodes a module list.
 *
 * A "module" key matches a top-level nav route (see src/components/icons.ts
 * NAV_ICONS and src/app/(app)/layout.tsx) — e.g. "purchasing" gates every
 * page under /purchasing.
 */
export type ModuleKey =
  | "inventory"
  | "customers"
  | "sales"
  | "accounting"
  | "tasks"
  | "reports"
  | "leave"
  | "attendance"
  | "inbox"
  | "staff"
  | "branches"
  | "repairs"
  | "purchasing"
  | "groups"
  | "brokers"
  | "targets";

export type PlanId = "self-hosted" | "trial" | "lite" | "full";

export const MODULE_LABELS: Record<ModuleKey, string> = {
  inventory: "Inventory",
  customers: "Customers",
  sales: "Sales & invoicing",
  accounting: "Accounting & reports",
  tasks: "Tasks",
  reports: "Reports",
  leave: "Leave",
  attendance: "Attendance",
  inbox: "Team inbox",
  staff: "Staff accounts",
  branches: "Multi-branch",
  repairs: "Repairs & custom orders",
  purchasing: "Purchasing & suppliers",
  groups: "Staff groups",
  brokers: "Brokers & memos",
  targets: "Sales targets",
};

const ALL_MODULES: ModuleKey[] = [
  "inventory",
  "customers",
  "sales",
  "accounting",
  "tasks",
  "reports",
  "leave",
  "attendance",
  "inbox",
  "staff",
  "branches",
  "repairs",
  "purchasing",
  "groups",
  "brokers",
  "targets",
];

/** The $9/mo plan: enough to track stock and bill customers, nothing else. */
const LITE_MODULES: ModuleKey[] = ["inventory", "customers", "sales"];

export const PLAN_CATALOG: Record<
  "lite" | "full",
  { id: "lite" | "full"; name: string; priceLabel: string; modules: ModuleKey[]; stripePriceEnvVar: string }
> = {
  lite: {
    id: "lite",
    name: "Lite",
    priceLabel: "$9/mo",
    modules: LITE_MODULES,
    stripePriceEnvVar: "STRIPE_PRICE_LITE",
  },
  full: {
    id: "full",
    name: "Full",
    priceLabel: "$19/mo",
    modules: ALL_MODULES,
    stripePriceEnvVar: "STRIPE_PRICE_FULL",
  },
};

export const TRIAL_DAYS = 14;

/** Modules every plan (including a trial that's run out) can still reach. */
const UNGATED_MODULES = new Set<ModuleKey>([]);

function modulesForPlan(plan: string): ModuleKey[] {
  if (plan === "self-hosted" || plan === "trial" || plan === "full") return ALL_MODULES;
  if (plan === "lite") return LITE_MODULES;
  return [];
}

export type EffectivePlan = {
  /** Whether the org currently has ANY app access at all (false ⇒ redirect everything to /billing). */
  hasAccess: boolean;
  /** Modules this org can use right now, given plan + billing status. */
  modules: ModuleKey[];
  /** True while on an unexpired trial — used for the "trial ends in N days" banner. */
  onTrial: boolean;
  trialDaysLeft: number | null;
};

/**
 * Resolves what an Organization can actually do right now, combining its
 * chosen plan with its billing status (a PAST_DUE or CANCELED org loses
 * access even if its `plan` column still says "full").
 */
export function resolveEffectivePlan(org: {
  plan: string;
  status: string;
  trialEndsAt: Date | null;
}): EffectivePlan {
  if (org.plan === "self-hosted") {
    return { hasAccess: true, modules: ALL_MODULES, onTrial: false, trialDaysLeft: null };
  }

  if (org.status === "TRIAL") {
    const msLeft = (org.trialEndsAt?.getTime() ?? 0) - Date.now();
    if (msLeft > 0) {
      return {
        hasAccess: true,
        modules: ALL_MODULES,
        onTrial: true,
        trialDaysLeft: Math.ceil(msLeft / 86_400_000),
      };
    }
    return { hasAccess: false, modules: [], onTrial: false, trialDaysLeft: 0 };
  }

  if (org.status === "ACTIVE") {
    return { hasAccess: true, modules: modulesForPlan(org.plan), onTrial: false, trialDaysLeft: null };
  }

  // PAST_DUE: Stripe is already retrying the card — a short grace period
  // keeps the business working while that plays out, with a banner nudging
  // them to update payment (added in the billing page UI).
  if (org.status === "PAST_DUE") {
    return { hasAccess: true, modules: modulesForPlan(org.plan), onTrial: false, trialDaysLeft: null };
  }

  // CANCELED, SUSPENDED, or anything else: no access except the ungated set.
  return { hasAccess: false, modules: Array.from(UNGATED_MODULES), onTrial: false, trialDaysLeft: null };
}

export function isModuleAllowed(effective: EffectivePlan, moduleKey: ModuleKey | null): boolean {
  if (!moduleKey) return true; // not a gated route (dashboard, account, billing, ...)
  if (!effective.hasAccess) return false;
  return effective.modules.includes(moduleKey);
}

/** Maps a request pathname to the module it belongs to, or null if it's never gated. */
export function moduleForPathname(pathname: string): ModuleKey | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;
  return (ALL_MODULES as string[]).includes(segment) ? (segment as ModuleKey) : null;
}
