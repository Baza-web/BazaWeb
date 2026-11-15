import "server-only";
import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db as rawDb } from "./db";
import { requireSession, requireSessionOrRedirect, type SessionPayload } from "./auth";
import { resolveEffectivePlan, isModuleAllowed, moduleForPathname } from "./plans";

/**
 * Every model below carries an organizationId column (see prisma/schema.prisma).
 * Organization itself is excluded — it has no organizationId, it IS the tenant.
 */
const TENANT_MODELS = new Set([
  "Branch",
  "Staff",
  "InventoryItem",
  "Customer",
  "CustomerNote",
  "Sale",
  "SaleItem",
  "Expense",
  "LedgerEntry",
  "Task",
  "TaskComment",
  "Message",
  "Notification",
  "PushSubscription",
  "LeaveRequest",
  "AttendanceLog",
  "RepairOrder",
  "Supplier",
  "PurchaseOrder",
  "PurchaseOrderItem",
  "StaffGroup",
  "SalesTarget",
  "Broker",
  "BrokerMemo",
  "BrokerMemoItem",
  "BrokerMemoEditRequest",
]);

const WHERE_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Returns a Prisma Client bound to one organization: every read/update/delete
 * on a tenant model is scoped to organizationId, and every create fills it in
 * automatically. This is the ONLY way application code should touch the
 * database — never import the raw client from "./db" outside this file and
 * prisma/seed.ts or prisma/demo-data.ts (which have no organization yet).
 *
 * Caveat: Prisma extensions don't see NESTED writes (e.g. `sale.create({
 * data: { items: { create: [...] } } })`), so the organizationId for a
 * nested child row must still be passed explicitly at the call site. Search
 * for "organizationId" in sales/purchasing/brokers actions for the pattern.
 */
export function scopedDb(organizationId: string) {
  if (!organizationId) {
    throw new Error("scopedDb() called without an organizationId");
  }

  return rawDb.$extends({
    name: `tenant-scope:${organizationId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) {
            return query(args);
          }

          const typedArgs = args as Record<string, unknown>;

          if (WHERE_OPERATIONS.has(operation)) {
            typedArgs.where = { ...(typedArgs.where as object | undefined), organizationId };
          } else if (operation === "create") {
            typedArgs.data = { ...(typedArgs.data as object | undefined), organizationId };
          } else if (operation === "createMany") {
            const data = typedArgs.data;
            typedArgs.data = Array.isArray(data)
              ? data.map((row) => ({ ...row, organizationId }))
              : data;
          } else if (operation === "upsert") {
            typedArgs.where = { ...(typedArgs.where as object | undefined), organizationId };
            typedArgs.create = { ...(typedArgs.create as object | undefined), organizationId };
          }

          return query(typedArgs as typeof args);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;

/**
 * Plan enforcement, run by both requireScopedSession() and
 * requireScopedSessionOrRedirect() below: middleware.ts stamps every
 * request with "x-pathname", which tells us which module (if any) this
 * request is for, so a Lite-plan org hitting /purchasing — or anyone whose
 * trial/subscription has lapsed — gets stopped centrally, without every
 * page or server action having to declare its own module.
 */
async function checkPlanAccess(db: ScopedDb, session: SessionPayload) {
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { plan: true, status: true, trialEndsAt: true },
  });
  const effective = resolveEffectivePlan(organization);

  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const moduleKey = moduleForPathname(pathname);

  if (isModuleAllowed(effective, moduleKey)) return;

  const reason = !effective.hasAccess ? "expired" : moduleKey ?? "expired";
  redirect(`/billing?blocked=${encodeURIComponent(reason)}`);
}

/**
 * Convenience for server actions/API routes: one call gets you both the
 * verified session and a db client already scoped to that session's
 * organization. Prefer this over calling requireSession() + scopedDb()
 * separately so a file can't accidentally use the raw unscoped `db`.
 */
export async function requireScopedSession(): Promise<{ session: SessionPayload; db: ScopedDb }> {
  const session = await requireSession();
  const db = scopedDb(session.organizationId);
  await checkPlanAccess(db, session);
  return { session, db };
}

/** Same as requireScopedSession(), but for pages/layouts: redirects instead of throwing. */
export async function requireScopedSessionOrRedirect(): Promise<{ session: SessionPayload; db: ScopedDb }> {
  const session = await requireSessionOrRedirect();
  const db = scopedDb(session.organizationId);
  await checkPlanAccess(db, session);
  return { session, db };
}

// Re-exported so call sites that only need the raw enum/type helpers don't
// have to reach into "./db" directly.
export type { Prisma };
