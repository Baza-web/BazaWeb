"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageStaff } from "@/lib/rbac";

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
  if (!canManageStaff(session.role)) throw new Error("Forbidden");

  const parsed = schema.parse({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
  });

  await db.branch.create({ data: parsed });
  revalidatePath("/branches");
}

export async function setMainBranch(branchId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.role)) throw new Error("Forbidden");

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
  if (!canManageStaff(session.role)) throw new Error("Forbidden");

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
