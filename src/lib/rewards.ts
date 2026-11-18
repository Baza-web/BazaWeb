import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { round2 } from "./utils";

type DbClient = typeof db | Prisma.TransactionClient;

/** Creates the singleton settings row on first read, so every deployment starts with the default rate (1000 LKR per 100,000 spent) without a seed step. */
export async function getRewardSettings(client: DbClient = db) {
  return client.rewardProgramSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

export async function setRewardRate(rewardPer100k: number, active: boolean) {
  await getRewardSettings();
  return db.rewardProgramSettings.update({
    where: { id: "default" },
    data: { rewardPer100k, active },
  });
}

/**
 * Called from inside createSale's own transaction (same pattern as
 * postSaleJournalEntry) right after a sale is created — awards
 * rewardPer100k LKR of reward balance per 100,000 LKR of that sale's
 * total. No-op if the program is switched off or the sale has no
 * customer (walk-in sales can't earn).
 */
export async function earnRewardsForSale(
  customerId: string | null,
  saleId: string,
  saleTotal: number,
  client: DbClient,
) {
  if (!customerId || saleTotal <= 0) return;
  const settings = await getRewardSettings(client);
  if (!settings.active || settings.rewardPer100k <= 0) return;

  const amount = round2((saleTotal * settings.rewardPer100k) / 100_000);
  if (amount <= 0) return;

  await client.rewardTransaction.create({
    data: { customerId, type: "EARNED", amount, saleId },
  });
  await client.customer.update({ where: { id: customerId }, data: { rewardBalance: { increment: amount } } });
}

/** Reverses a sale's earned reward when the sale is voided — see performSaleDeletion in src/lib/deletion.ts. Leaves the balance negative rather than clamping it if some of it was already redeemed; that's a real discrepancy worth surfacing, not hiding. */
export async function reverseRewardsForSale(saleId: string, client: DbClient) {
  const earned = await client.rewardTransaction.findFirst({ where: { saleId, type: "EARNED" } });
  if (!earned) return;
  await client.customer.update({ where: { id: earned.customerId }, data: { rewardBalance: { decrement: earned.amount } } });
  await client.rewardTransaction.delete({ where: { id: earned.id } });
}

export async function redeemRewards(customerId: string, amount: number, staffId: string, note: string | undefined) {
  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const redeemAmount = round2(amount);
  if (redeemAmount <= 0) throw new Error("Enter a positive amount to redeem.");
  if (redeemAmount > customer.rewardBalance) {
    throw new Error(`${customer.name} only has ${customer.rewardBalance.toFixed(2)} in reward balance.`);
  }

  await db.$transaction([
    db.rewardTransaction.create({
      data: { customerId, type: "REDEEMED", amount: redeemAmount, createdById: staffId, note },
    }),
    db.customer.update({ where: { id: customerId }, data: { rewardBalance: { decrement: redeemAmount } } }),
  ]);
}
