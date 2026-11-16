"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { postJournalEntry, reverseJournalEntry } from "@/lib/ledger";

const lineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
});

const entrySchema = z.object({
  date: z.coerce.date(),
  description: z.string().min(1),
  reference: z.string().optional(),
  branchId: z.string().optional(),
  department: z.string().optional(),
  linesJson: z.string(),
});

export async function createJournalEntry(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role) ? String(formData.get("branchId") || "") || undefined : session.branchId ?? undefined;

  const parsed = entrySchema.parse({
    date: formData.get("date"),
    description: formData.get("description"),
    reference: formData.get("reference") || undefined,
    branchId,
    department: formData.get("department") || undefined,
    linesJson: formData.get("linesJson"),
  });

  const rawLines = JSON.parse(parsed.linesJson);
  const lines = z.array(lineSchema).parse(rawLines);

  await postJournalEntry(session, {
    date: parsed.date,
    description: parsed.description,
    reference: parsed.reference,
    branchId: parsed.branchId,
    department: parsed.department,
    lines,
  });

  revalidatePath("/accounting/journal-entries");
  revalidatePath("/accounting/general-ledger");
  revalidatePath("/accounting/trial-balance");
}

export async function reverseEntry(entryId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) throw new Error("Forbidden");

  await reverseJournalEntry(session, entryId);
  revalidatePath("/accounting/journal-entries");
  revalidatePath("/accounting/general-ledger");
  revalidatePath("/accounting/trial-balance");
}
