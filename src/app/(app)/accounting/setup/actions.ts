"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting } from "@/lib/rbac";
import { postJournalEntry, type JournalLineInput } from "@/lib/ledger";
import { round2 } from "@/lib/utils";
import { backfillMissingJournalEntries } from "@/lib/accountingHealth";

const OPENING_BALANCES_REFERENCE = "OPENING-BALANCES";

const openingBalancesSchema = z.object({
  date: z.coerce.date(),
  cash: z.coerce.number().min(0).default(0),
  bank: z.coerce.number().min(0).default(0),
  accountsReceivable: z.coerce.number().min(0).default(0),
  inventory: z.coerce.number().min(0).default(0),
  accountsPayable: z.coerce.number().min(0).default(0),
});

/**
 * Posts a single balanced "Opening Balances" entry: a debit line per asset
 * the owner enters (Cash, Bank, AR, Inventory), a credit line per
 * liability (Accounts Payable), and a credit to Owner's Capital for
 * whatever's left — computed automatically so the owner never has to get
 * a trial-balance-style entry to balance by hand. Refuses to run twice;
 * reverse the existing entry from Journal Entries first if it needs
 * redoing.
 */
export async function postOpeningBalances(formData: FormData): Promise<{ status: "posted" | "error"; message?: string }> {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) throw new Error("Forbidden");

  const already = await db.journalEntry.findFirst({ where: { reference: OPENING_BALANCES_REFERENCE } });
  if (already) {
    return {
      status: "error",
      message: `Opening balances were already posted (${already.entryNumber}) — reverse that entry from Journal Entries first if you need to redo it.`,
    };
  }

  const parsed = openingBalancesSchema.parse({
    date: formData.get("date"),
    cash: formData.get("cash") || 0,
    bank: formData.get("bank") || 0,
    accountsReceivable: formData.get("accountsReceivable") || 0,
    inventory: formData.get("inventory") || 0,
    accountsPayable: formData.get("accountsPayable") || 0,
  });

  const accounts = await db.account.findMany({
    where: { code: { in: ["1000", "1010", "1100", "1200", "2000", "3000"] } },
  });
  const idFor = (code: string) => {
    const a = accounts.find((acc) => acc.code === code);
    if (!a) throw new Error(`Account ${code} isn't set up yet — seed the Chart of Accounts first.`);
    return a.id;
  };

  const assetTotal = round2(parsed.cash + parsed.bank + parsed.accountsReceivable + parsed.inventory);
  const liabilityTotal = round2(parsed.accountsPayable);
  const equityPlug = round2(assetTotal - liabilityTotal);

  if (assetTotal === 0 && liabilityTotal === 0) {
    return { status: "error", message: "Enter at least one opening balance before posting." };
  }

  const lines: JournalLineInput[] = [];
  if (parsed.cash > 0) lines.push({ accountId: idFor("1000"), debit: parsed.cash, credit: 0 });
  if (parsed.bank > 0) lines.push({ accountId: idFor("1010"), debit: parsed.bank, credit: 0 });
  if (parsed.accountsReceivable > 0) lines.push({ accountId: idFor("1100"), debit: parsed.accountsReceivable, credit: 0 });
  if (parsed.inventory > 0) lines.push({ accountId: idFor("1200"), debit: parsed.inventory, credit: 0 });
  if (parsed.accountsPayable > 0) lines.push({ accountId: idFor("2000"), debit: 0, credit: parsed.accountsPayable });

  if (equityPlug > 0) lines.push({ accountId: idFor("3000"), debit: 0, credit: equityPlug });
  else if (equityPlug < 0) lines.push({ accountId: idFor("3000"), debit: -equityPlug, credit: 0 });

  await postJournalEntry(session, {
    date: parsed.date,
    description: "Opening Balances",
    reference: OPENING_BALANCES_REFERENCE,
    lines,
  });

  revalidatePath("/accounting/setup");
  revalidatePath("/accounting/trial-balance");
  revalidatePath("/accounting/balance-sheet");
  return { status: "posted" };
}

export async function runBackfill(): Promise<{ salesPosted: number; expensesPosted: number }> {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.role)) throw new Error("Forbidden");

  const result = await backfillMissingJournalEntries(session);
  revalidatePath("/accounting/setup");
  revalidatePath("/accounting/health-check");
  revalidatePath("/accounting/trial-balance");
  revalidatePath("/accounting/balance-sheet");
  return result;
}
