"use server";

import { revalidatePath } from "next/cache";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canReviewCustomerRequests } from "@/lib/rbac";
import { reviewDeletionRequest, cancelDeletionRequest } from "@/lib/deletion";

export async function decideDeletionRequest(requestId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  // Coarse gate: Owner or Admin may be reviewing something. reviewDeletionRequest itself
  // enforces the fine-grained rule (Admin: Customer requests only).
  if (!canReviewCustomerRequests(session.roles)) throw new Error("Forbidden");

  const decision = String(formData.get("decision"));
  if (decision !== "APPROVED" && decision !== "REJECTED") throw new Error("Invalid decision.");

  await reviewDeletionRequest(session, requestId, decision);
  revalidatePath("/deletion-requests");
  revalidatePath("/staff");
  revalidatePath("/inventory");
  revalidatePath("/customers");
  revalidatePath("/sales");
}

/** The requester can withdraw their own still-pending request at any time, rather than being stuck waiting on an Owner. */
export async function withdrawDeletionRequest(requestId: string) {
  const session = await requireSessionOrRedirect();
  await cancelDeletionRequest(session, requestId);
  revalidatePath("/deletion-requests");
}
