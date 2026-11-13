"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";

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

  await db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        branchId: parsed.branchId,
        category: parsed.category,
        description: parsed.description,
        amount: parsed.amount,
        date: parsed.date ?? new Date(),
        createdById: session.staffId,
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
