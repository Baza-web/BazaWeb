"use server";

import { revalidatePath } from "next/cache";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageIntegrations } from "@/lib/rbac";
import { disconnectDrive } from "@/lib/googleDrive";
import { disconnectMail } from "@/lib/googleMail";

export async function disconnectGoogleDrive() {
  const session = await requireSessionOrRedirect();
  if (!canManageIntegrations(session.role)) throw new Error("Forbidden");
  await disconnectDrive();
  revalidatePath("/settings");
}

export async function disconnectGmail() {
  const session = await requireSessionOrRedirect();
  if (!canManageIntegrations(session.role)) throw new Error("Forbidden");
  await disconnectMail();
  revalidatePath("/settings");
}
