"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting } from "@/lib/rbac";
import { seedDefaultAccounts } from "@/lib/ledger";

export async function seedDefaultChartOfAccounts() {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.roles)) throw new Error("Forbidden");
  await seedDefaultAccounts();
  revalidatePath("/accounting/chart-of-accounts");
}

const accountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(2),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
});

export async function createAccount(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.roles)) throw new Error("Forbidden");

  const parsed = accountSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    type: formData.get("type"),
  });

  const existing = await db.account.findUnique({ where: { code: parsed.code } });
  if (existing) throw new Error(`An account with code ${parsed.code} already exists.`);

  await db.account.create({ data: { ...parsed, isSystem: false } });
  revalidatePath("/accounting/chart-of-accounts");
}

export async function toggleAccountActive(accountId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.roles)) throw new Error("Forbidden");

  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } });
  await db.account.update({ where: { id: accountId }, data: { active: !account.active } });
  revalidatePath("/accounting/chart-of-accounts");
}

/** Refuses if the account has ever been posted to — accounts with journal history are deactivated, never deleted. */
export async function deleteAccount(accountId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.roles)) throw new Error("Forbidden");

  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } });
  if (account.isSystem) throw new Error("Default accounts can't be deleted — deactivate it instead if it's not needed.");

  const lineCount = await db.journalLine.count({ where: { accountId } });
  if (lineCount > 0) throw new Error("This account has posted journal entries and can't be deleted — deactivate it instead.");

  await db.account.delete({ where: { id: accountId } });
  revalidatePath("/accounting/chart-of-accounts");
}
