"use server";

import { revalidatePath } from "next/cache";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canReviewDeletions } from "@/lib/rbac";
import { reviewDeletionRequest } from "@/lib/deletion";

export async function decideDeletionRequest(requestId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canReviewDeletions(session.role)) throw new Error("Forbidden");

  const decision = String(formData.get("decision"));
  if (decision !== "APPROVED" && decision !== "REJECTED") throw new Error("Invalid decision.");

  await reviewDeletionRequest(session, requestId, decision);
  revalidatePath("/deletion-requests");
  revalidatePath("/staff");
  revalidatePath("/inventory");
  revalidatePath("/sales");
}
