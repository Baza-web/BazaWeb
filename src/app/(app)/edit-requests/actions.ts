"use server";

import { revalidatePath } from "next/cache";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canReviewDeletions } from "@/lib/rbac";
import { reviewEditRequest } from "@/lib/editRequests";

export async function decideEditRequest(requestId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canReviewDeletions(session.role)) throw new Error("Forbidden");

  const decision = String(formData.get("decision"));
  if (decision !== "APPROVED" && decision !== "REJECTED") throw new Error("Invalid decision.");

  await reviewEditRequest(session, requestId, decision);
  revalidatePath("/edit-requests");
  revalidatePath("/staff");
  revalidatePath("/inventory");
}
