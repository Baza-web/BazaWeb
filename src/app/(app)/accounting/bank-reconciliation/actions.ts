"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting } from "@/lib/rbac";
import { parseBankStatementFile } from "@/lib/bankReconciliation";
import { round2 } from "@/lib/utils";

export async function uploadBankStatement(formData: FormData): Promise<{ imported: number; skipped: number; error?: string }> {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) throw new Error("Forbidden");

  const accountId = String(formData.get("accountId") || "");
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Pick which account this statement is for.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { imported: 0, skipped: 0, error: "Attach a .xlsx or .csv bank statement file first." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows, error } = await parseBankStatementFile(buffer, file.name);
  if (error) return { imported: 0, skipped: 0, error };
  if (rows.length === 0) return { imported: 0, skipped: 0, error: "No rows could be read from that file." };

  // Re-uploading the same statement (or an overlapping date range) must not duplicate lines —
  // skip any row that exactly matches an existing one for this account.
  const existing = await db.bankStatementLine.findMany({
    where: { accountId },
    select: { date: true, description: true, amount: true },
  });
  const existingKeys = new Set(existing.map((e) => `${e.date.toISOString()}|${e.description}|${e.amount}`));

  const toCreate = rows.filter((r) => !existingKeys.has(`${r.date.toISOString()}|${r.description}|${round2(r.amount)}`));

  if (toCreate.length > 0) {
    await db.bankStatementLine.createMany({
      data: toCreate.map((r) => ({
        accountId,
        date: r.date,
        description: r.description,
        amount: round2(r.amount),
        uploadedById: session.staffId,
      })),
    });
  }

  revalidatePath("/accounting/bank-reconciliation");
  return { imported: toCreate.length, skipped: rows.length - toCreate.length };
}

/** Links a bank statement line to a posted journal line — confirms the books agree with the bank, never creates or edits a journal entry. */
export async function matchBankLine(bankLineId: string, journalLineId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) throw new Error("Forbidden");

  const [bankLine, journalLine] = await Promise.all([
    db.bankStatementLine.findUniqueOrThrow({ where: { id: bankLineId } }),
    db.journalLine.findUniqueOrThrow({ where: { id: journalLineId } }),
  ]);
  if (bankLine.reconciled) throw new Error("This statement line is already matched.");
  if (journalLine.accountId !== bankLine.accountId) throw new Error("That journal line isn't on the same account.");

  const journalMovement = round2(journalLine.debit - journalLine.credit);
  if (journalMovement !== bankLine.amount) {
    throw new Error(
      `Amounts don't match: the statement line is ${bankLine.amount}, the journal line is ${journalMovement}.`,
    );
  }

  await db.bankStatementLine.update({
    where: { id: bankLineId },
    data: { matchedJournalLineId: journalLineId, reconciled: true },
  });
  revalidatePath("/accounting/bank-reconciliation");
}

export async function unmatchBankLine(bankLineId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) throw new Error("Forbidden");

  await db.bankStatementLine.update({
    where: { id: bankLineId },
    data: { matchedJournalLineId: null, reconciled: false },
  });
  revalidatePath("/accounting/bank-reconciliation");
}

export async function deleteBankStatementLine(bankLineId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) throw new Error("Forbidden");

  const line = await db.bankStatementLine.findUniqueOrThrow({ where: { id: bankLineId } });
  if (line.reconciled) throw new Error("Unmatch this line before deleting it.");
  await db.bankStatementLine.delete({ where: { id: bankLineId } });
  revalidatePath("/accounting/bank-reconciliation");
}
