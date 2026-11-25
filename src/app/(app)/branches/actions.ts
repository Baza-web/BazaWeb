"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageStaff, canAddOrDeleteBranches } from "@/lib/rbac";

const numOrUndef = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.number().optional(),
);

const schema = z.object({
  name: z.string().min(2),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export async function createBranch(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canAddOrDeleteBranches(session.roles)) throw new Error("Forbidden");

  const parsed = schema.parse({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
  });

  await db.branch.create({ data: parsed });
  revalidatePath("/branches");
}

/**
 * Owner-only. Refuses to delete a branch that still has any real data attached — that's for the
 * Owner to move or clear out first, never silently cascaded away.
 *
 * Returns { error } instead of throwing for this expected, user-facing case: Next.js redacts a
 * thrown Error's message in production builds (replacing it with a generic "Server Components
 * render" notice), so a thrown Error here would silently lose the actual reason to the Owner on
 * the live site even though it works fine in local dev.
 */
export async function deleteBranch(branchId: string): Promise<{ error: string } | { success: true }> {
  const session = await requireSessionOrRedirect();
  if (!canAddOrDeleteBranches(session.roles)) throw new Error("Forbidden");

  const branch = await db.branch.findUnique({
    where: { id: branchId },
    include: {
      _count: {
        select: {
          staff: true,
          inventoryItems: true,
          customers: true,
          sales: true,
          expenses: true,
          ledgerEntries: true,
          tasks: true,
          attendanceLogs: true,
          repairOrders: true,
          purchaseOrders: true,
          staffGroups: true,
          salesTargets: true,
          brokers: true,
          brokerMemos: true,
        },
      },
    },
  });
  if (!branch) return { error: "That branch no longer exists." };

  const totalRecords = Object.values(branch._count).reduce((sum, n) => sum + n, 0);
  if (totalRecords > 0) {
    return {
      error: `${branch.name} still has data attached (staff, inventory, sales, etc.) — move or remove that first before deleting the branch.`,
    };
  }

  await db.branch.delete({ where: { id: branchId } });
  revalidatePath("/branches");
  return { success: true };
}

/**
 * Owner/Admin — same tier as the geofence settings below, since renaming or correcting a
 * branch's address/phone is "editing one's details," not the bigger structural change of
 * adding or removing a branch outright (Owner-only, see canAddOrDeleteBranches).
 *
 * Returns { error } rather than throwing, for the same production-redaction reason as
 * deleteBranch above.
 */
export async function updateBranchDetails(
  branchId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.roles)) throw new Error("Forbidden");

  const parsed = schema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: "Name must be at least 2 characters." };

  await db.branch.update({ where: { id: branchId }, data: parsed.data });
  revalidatePath("/branches");
  return { success: true };
}

export async function setMainBranch(branchId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.roles)) throw new Error("Forbidden");

  await db.$transaction([
    db.branch.updateMany({ where: { isMain: true }, data: { isMain: false } }),
    db.branch.update({ where: { id: branchId }, data: { isMain: true } }),
  ]);
  revalidatePath("/branches");
}

const geofenceSchema = z.object({
  latitude: numOrUndef,
  longitude: numOrUndef,
  geofenceRadiusM: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
});

export async function updateBranchGeofence(branchId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.roles)) throw new Error("Forbidden");

  const parsed = geofenceSchema.parse({
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    geofenceRadiusM: formData.get("geofenceRadiusM"),
  });

  const complete = parsed.latitude != null && parsed.longitude != null && parsed.geofenceRadiusM != null;
  const cleared = parsed.latitude == null && parsed.longitude == null && parsed.geofenceRadiusM == null;

  if (!complete && !cleared) {
    throw new Error("Set all three of latitude, longitude, and radius — or leave all blank to disable.");
  }

  await db.branch.update({
    where: { id: branchId },
    data: {
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      geofenceRadiusM: parsed.geofenceRadiusM ?? null,
    },
  });
  revalidatePath("/branches");
}
