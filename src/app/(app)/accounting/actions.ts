"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { saveUploadedFile, detectFileKind } from "@/lib/uploads";
import { extractExpenseFromImage, extractExpenseFromText, aiConfigured, type ExtractedExpense } from "@/lib/ai";

const EXT_TO_MEDIA_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * Reads a receipt photo (or pasted email/order text) and asks AI to pull out
 * the amount/description/category/date. Returns a best-effort guess for the
 * staff member to review — never saves anything on its own.
 */
export async function scanReceipt(formData: FormData): Promise<ExtractedExpense & { error?: string }> {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) throw new Error("Forbidden");

  if (!aiConfigured()) {
    return {
      amount: null,
      description: null,
      category: null,
      date: null,
      error: "Receipt scanning isn't set up yet — ask an Admin to add ANTHROPIC_API_KEY. You can still enter this manually below.",
    };
  }

  try {
    const file = formData.get("image");
    const text = formData.get("text");

    if (file instanceof File && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const detected = detectFileKind(buffer);
      if (!detected || detected.kind !== "image") {
        return { amount: null, description: null, category: null, date: null, error: "That doesn't look like a photo — try a JPG, PNG, GIF, or WEBP." };
      }
      const result = await extractExpenseFromImage(buffer, EXT_TO_MEDIA_TYPE[detected.ext]);
      if (result.amount === null && result.description === null) {
        return { ...result, error: "Couldn't read this clearly — enter the details manually below." };
      }
      return result;
    }

    if (typeof text === "string" && text.trim().length > 0) {
      const result = await extractExpenseFromText(text.trim());
      if (result.amount === null && result.description === null) {
        return { ...result, error: "Couldn't find expense details in that text — enter manually below." };
      }
      return result;
    }

    return { amount: null, description: null, category: null, date: null, error: "Add a photo or paste some text first." };
  } catch (err) {
    console.error("scanReceipt failed:", err);
    return { amount: null, description: null, category: null, date: null, error: "Something went wrong reading that — enter the details manually below." };
  }
}

const expenseSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  date: z.coerce.date().optional(),
  branchId: z.string().min(1),
});

export async function createExpense(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const parsed = expenseSchema.parse({
    category: formData.get("category"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    date: formData.get("date") || undefined,
    branchId,
  });

  const receiptFile = formData.get("receiptImage");
  const receiptImage =
    receiptFile instanceof File && receiptFile.size > 0 ? await saveUploadedFile(receiptFile, "receipts") : null;

  await db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        branchId: parsed.branchId,
        category: parsed.category,
        description: parsed.description,
        amount: parsed.amount,
        date: parsed.date ?? new Date(),
        createdById: session.staffId,
        receiptImage,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        branchId: parsed.branchId,
        type: "EXPENSE",
        amount: parsed.amount,
        description: `${parsed.category}: ${parsed.description}`,
        date: expense.date,
        expenseId: expense.id,
      },
    });
  });

  revalidatePath("/accounting");
}
