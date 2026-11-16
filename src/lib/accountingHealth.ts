import "server-only";
import { db } from "./db";
import type { SessionPayload } from "./auth";
import { round2 } from "./utils";
import { postSaleJournalEntry, postExpenseJournalEntry } from "./ledger";

/**
 * A snapshot of whether the books are internally consistent — surfaced on
 * the Health Check page so an Owner can see at a glance whether anything
 * needs attention, rather than having to dig through the Trial Balance,
 * Bank Reconciliation, and transaction lists separately.
 */
export async function getAccountingHealth() {
  const [lineTotals, unpostedSales, unpostedExpenses, unreconciledBankLines, unbalancedEntries] = await Promise.all([
    db.journalLine.aggregate({ _sum: { debit: true, credit: true } }),
    db.sale.count({ where: { journalEntry: null } }),
    db.expense.count({ where: { journalEntry: null } }),
    db.bankStatementLine.count({ where: { reconciled: false } }),
    db.journalEntry.findMany({ select: { id: true, entryNumber: true, lines: { select: { debit: true, credit: true } } } }),
  ]);

  const totalDebit = round2(lineTotals._sum.debit ?? 0);
  const totalCredit = round2(lineTotals._sum.credit ?? 0);

  const unbalancedEntryNumbers = unbalancedEntries
    .filter((e) => round2(e.lines.reduce((s, l) => s + l.debit, 0)) !== round2(e.lines.reduce((s, l) => s + l.credit, 0)))
    .map((e) => e.entryNumber);

  return {
    totalDebit,
    totalCredit,
    trialBalanceOk: totalDebit === totalCredit,
    unpostedSales,
    unpostedExpenses,
    unreconciledBankLines,
    unbalancedEntryNumbers,
  };
}

/**
 * Posts journal entries for any Sale/Expense that was recorded before
 * auto-posting existed (or was restored from an old backup), using each
 * record's own historical date so the ledger's timeline stays accurate —
 * not "now" for everything. Safe to run repeatedly: only ever touches
 * records that still have no journal entry at all.
 */
export async function backfillMissingJournalEntries(session: SessionPayload) {
  const [sales, expenses] = await Promise.all([
    db.sale.findMany({ where: { journalEntry: null }, include: { items: { include: { inventoryItem: true } } } }),
    db.expense.findMany({ where: { journalEntry: null } }),
  ]);

  let salesPosted = 0;
  let expensesPosted = 0;

  for (const sale of sales) {
    const costOfGoodsSold = round2(sale.items.reduce((s, it) => s + it.inventoryItem.costPrice * it.quantity, 0));
    await postSaleJournalEntry(
      session,
      { id: sale.id, invoiceNumber: sale.invoiceNumber, branchId: sale.branchId, total: sale.total, amountPaid: sale.amountPaid, date: sale.createdAt },
      costOfGoodsSold,
    );
    salesPosted += 1;
  }

  for (const expense of expenses) {
    await postExpenseJournalEntry(session, {
      id: expense.id,
      category: expense.category,
      description: `${expense.category}: ${expense.description}`,
      amount: expense.amount,
      branchId: expense.branchId,
      date: expense.date,
    });
    expensesPosted += 1;
  }

  return { salesPosted, expensesPosted };
}
