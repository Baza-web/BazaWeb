/**
 * Removes everything created by accounting-demo-data.ts — identified purely
 * by its "[ACCT-DEMO]" tag and @acct-demo.test / ACCTDEMO- markers, never
 * by date or id ranges, so it can't accidentally touch real data.
 *
 * Unlike a real correction (which must go through a reversal — see
 * src/lib/ledger.ts), these rows were never real financial records, so
 * this hard-deletes them: journal lines, journal entries, ledger entries,
 * sales (restocking inventory first, same as a real sale void), expenses,
 * purchase orders, bank statement lines, then the demo customers/suppliers/
 * inventory items themselves, in FK-safe order.
 *
 * Run inside the app container:
 *   docker compose exec app node_modules/.bin/tsx prisma/accounting-demo-cleanup.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TAG = "[ACCT-DEMO]";
const DEMO_EMAIL_DOMAIN = "@acct-demo.test";
const SKU_PREFIX = "ACCTDEMO-";

async function main() {
  console.log("Removing Accounting cross-check demo data...");

  // --- Sales (restock inventory, then delete sale + its journal/ledger entries) ---
  const sales = await db.sale.findMany({ where: { notes: TAG }, include: { items: true } });
  for (const sale of sales) {
    await db.$transaction(async (tx) => {
      for (const item of sale.items) {
        const updated = await tx.inventoryItem.update({ where: { id: item.inventoryItemId }, data: { quantity: { increment: item.quantity } } });
        if (updated.status === "SOLD" && updated.quantity > 0) {
          await tx.inventoryItem.update({ where: { id: item.inventoryItemId }, data: { status: "IN_STOCK" } });
        }
      }
      const je = await tx.journalEntry.findFirst({ where: { saleId: sale.id } });
      if (je) {
        await tx.journalLine.deleteMany({ where: { journalEntryId: je.id } });
        await tx.journalEntry.delete({ where: { id: je.id } });
      }
      await tx.ledgerEntry.deleteMany({ where: { saleId: sale.id } });
      await tx.sale.delete({ where: { id: sale.id } });
    });
  }
  console.log(`  Removed ${sales.length} demo sales (inventory restocked)`);

  // --- Expenses (covers brand expenses + purchase-order payments) ---------
  const expenses = await db.expense.findMany({ where: { OR: [{ description: { startsWith: TAG } }, { description: { contains: TAG } }] } });
  for (const expense of expenses) {
    await db.$transaction(async (tx) => {
      const je = await tx.journalEntry.findFirst({ where: { expenseId: expense.id } });
      if (je) {
        await tx.journalLine.deleteMany({ where: { journalEntryId: je.id } });
        await tx.journalEntry.delete({ where: { id: je.id } });
      }
      await tx.ledgerEntry.deleteMany({ where: { expenseId: expense.id } });
      await tx.expense.delete({ where: { id: expense.id } });
    });
  }
  console.log(`  Removed ${expenses.length} demo expenses`);

  // --- Purchase orders (items cascade) + their suppliers ------------------
  const purchaseOrders = await db.purchaseOrder.findMany({ where: { notes: TAG } });
  for (const po of purchaseOrders) {
    await db.purchaseOrder.delete({ where: { id: po.id } });
  }
  console.log(`  Removed ${purchaseOrders.length} demo purchase orders`);

  const suppliers = await db.supplier.findMany({ where: { OR: [{ name: { startsWith: TAG } }, { email: { endsWith: DEMO_EMAIL_DOMAIN } }] } });
  for (const s of suppliers) {
    await db.supplier.delete({ where: { id: s.id } }).catch(() => {
      console.log(`    Skipped supplier "${s.name}" — still referenced (a non-demo purchase order points at it).`);
    });
  }
  console.log(`  Removed demo suppliers`);

  // --- Manual journal entries (identified by description tag, no sale/expense link) ---
  const manualEntries = await db.journalEntry.findMany({ where: { description: { startsWith: TAG }, saleId: null, expenseId: null } });
  for (const je of manualEntries) {
    await db.journalLine.deleteMany({ where: { journalEntryId: je.id } });
    await db.journalEntry.delete({ where: { id: je.id } });
  }
  console.log(`  Removed ${manualEntries.length} manual demo journal entries`);

  // --- Bank statement lines ------------------------------------------------
  const bankLines = await db.bankStatementLine.deleteMany({ where: { description: { startsWith: TAG } } });
  console.log(`  Removed ${bankLines.count} demo bank statement lines`);

  // --- Inventory items (now unreferenced) ----------------------------------
  const items = await db.inventoryItem.findMany({ where: { sku: { startsWith: SKU_PREFIX } } });
  for (const item of items) {
    await db.inventoryItem.delete({ where: { id: item.id } }).catch(() => {
      console.log(`    Skipped item "${item.sku}" — still referenced by a sale.`);
    });
  }
  console.log(`  Removed demo inventory items`);

  // --- Customers -------------------------------------------------------------
  const customers = await db.customer.deleteMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } });
  console.log(`  Removed ${customers.count} demo customers`);

  console.log("\nDone — all [ACCT-DEMO]-tagged records removed.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
