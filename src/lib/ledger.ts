import "server-only";
import { db } from "./db";
import type { SessionPayload } from "./auth";
import { round2 } from "./utils";
import type { AccountType, Prisma } from "@prisma/client";

/** Anything that can run `db.account`/`db.journalEntry`/`db.journalLine` queries — the top-level client, or a `$transaction` callback's `tx`, so these helpers can be composed into a caller's own transaction instead of always opening a new one. */
type DbClient = typeof db | Prisma.TransactionClient;

/**
 * Chart of Accounts defaults, per the business's requested account
 * structure. Seeded once (see seedDefaultAccounts) — idempotent, never
 * overwrites or duplicates an account that already exists by code.
 */
export const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  // Assets
  { code: "1000", name: "Cash", type: "ASSET" },
  { code: "1010", name: "Bank", type: "ASSET" },
  { code: "1020", name: "Petty Cash", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  { code: "1200", name: "Inventory", type: "ASSET" },
  { code: "1500", name: "Fixed Assets", type: "ASSET" },
  { code: "1900", name: "Other Assets", type: "ASSET" },
  // Liabilities
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2100", name: "Customer Advances", type: "LIABILITY" },
  { code: "2200", name: "Outstanding Salaries", type: "LIABILITY" },
  { code: "2900", name: "Other Liabilities", type: "LIABILITY" },
  // Equity
  { code: "3000", name: "Owner's Capital", type: "EQUITY" },
  { code: "3100", name: "Retained Earnings", type: "EQUITY" },
  { code: "3200", name: "Current Year Earnings", type: "EQUITY" },
  { code: "3300", name: "Historical Data Suspense", type: "EQUITY" },
  // Income
  { code: "4000", name: "Jewelry Sales", type: "INCOME" },
  { code: "4010", name: "Gemstone Sales", type: "INCOME" },
  { code: "4020", name: "Custom Orders", type: "INCOME" },
  { code: "4030", name: "Workshop Income", type: "INCOME" },
  { code: "4900", name: "Other Income", type: "INCOME" },
  // Expenses
  { code: "5000", name: "Salaries", type: "EXPENSE" },
  { code: "5005", name: "Cost of Goods Sold", type: "EXPENSE" },
  { code: "5010", name: "Rent", type: "EXPENSE" },
  { code: "5020", name: "Marketing", type: "EXPENSE" },
  { code: "5030", name: "Transportation", type: "EXPENSE" },
  { code: "5040", name: "Utilities", type: "EXPENSE" },
  { code: "5050", name: "Packaging", type: "EXPENSE" },
  { code: "5060", name: "Administration", type: "EXPENSE" },
  { code: "5070", name: "Workshop Expenses", type: "EXPENSE" },
  { code: "5080", name: "Bank Charges", type: "EXPENSE" },
  { code: "5900", name: "Other Expenses", type: "EXPENSE" },
];

/** Idempotent — only inserts accounts whose code doesn't already exist. Safe to call repeatedly; never overwrites or duplicates. */
export async function seedDefaultAccounts(client: DbClient = db) {
  const existing = await client.account.findMany({ select: { code: true } });
  const existingCodes = new Set(existing.map((a) => a.code));
  const toCreate = DEFAULT_ACCOUNTS.filter((a) => !existingCodes.has(a.code));
  if (toCreate.length === 0) return { created: 0 };
  await client.account.createMany({ data: toCreate.map((a) => ({ ...a, isSystem: true })) });
  return { created: toCreate.length };
}

async function nextEntryNumber(client: DbClient): Promise<string> {
  const count = await client.journalEntry.count();
  return `JE-${String(count + 1).padStart(6, "0")}`;
}

/** Looks an account up by its chart-of-accounts code, seeding the defaults once (idempotent) if it isn't there yet — covers an install that predates a newly-added default account code. Throws if the code is genuinely unknown. */
async function getAccountIdByCode(code: string, client: DbClient): Promise<string> {
  const found = await client.account.findUnique({ where: { code } });
  if (found) return found.id;
  await seedDefaultAccounts(client);
  const retried = await client.account.findUniqueOrThrow({ where: { code } });
  return retried.id;
}

/** Expense categories are free text (see the "category" input on the Accounting page). Maps a category to its chart-of-accounts code, with a few known synonyms, falling back to "Other Expenses" rather than failing — auto-posting must never block recording an expense just because its category doesn't match an account name. */
const EXPENSE_NAME_TO_CODE = new Map(
  DEFAULT_ACCOUNTS.filter((a) => a.type === "EXPENSE" && a.code !== "5005").map((a) => [a.name.toLowerCase(), a.code]),
);
const EXPENSE_CATEGORY_OVERRIDES: Record<string, string> = {
  "purchase order": "1200", // buying inventory is an asset purchase, not an expense
  payroll: "5000",
};

async function resolveExpenseDebitAccountId(category: string, client: DbClient): Promise<string> {
  const key = category.trim().toLowerCase();
  const code = EXPENSE_CATEGORY_OVERRIDES[key] ?? EXPENSE_NAME_TO_CODE.get(key) ?? "5900";
  return getAccountIdByCode(code, client);
}

export type JournalLineInput = { accountId: string; debit: number; credit: number };

/**
 * Posts a balanced double-entry journal entry. Rejects anything where
 * total debits don't exactly equal total credits (to the cent), or
 * where a line has both a debit and a credit, or neither. Every line's
 * amount is rounded to 2 decimals first (decimal-safe: compares rounded
 * cents, not raw floats) so near-equal floating point sums can't slip
 * through as "balanced".
 *
 * `client` lets a caller fold this into its own `$transaction` (e.g.
 * posting a sale's revenue entry atomically with the sale row itself).
 * `link` optionally ties the entry to the Sale/Expense it was posted
 * for, so it can be found again later for a reversal or a repost.
 */
export async function postJournalEntry(
  session: SessionPayload,
  input: {
    date: Date;
    description: string;
    reference?: string;
    branchId?: string | null;
    department?: string | null;
    lines: JournalLineInput[];
  },
  client: DbClient = db,
  link?: { saleId?: string; expenseId?: string },
) {
  const lines = input.lines.map((l) => ({
    accountId: l.accountId,
    debit: round2(l.debit || 0),
    credit: round2(l.credit || 0),
  }));

  if (lines.length < 2) throw new Error("A journal entry needs at least two lines.");
  for (const line of lines) {
    if (line.debit > 0 && line.credit > 0) throw new Error("A line can't have both a debit and a credit.");
    if (line.debit === 0 && line.credit === 0) throw new Error("Every line needs either a debit or a credit amount.");
    if (line.debit < 0 || line.credit < 0) throw new Error("Amounts can't be negative.");
  }

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (totalDebit !== totalCredit) {
    throw new Error(`Entry is unbalanced: total debits (${totalDebit}) must equal total credits (${totalCredit}).`);
  }
  if (totalDebit === 0) throw new Error("Entry has no amount.");

  const entryNumber = await nextEntryNumber(client);
  return client.journalEntry.create({
    data: {
      entryNumber,
      date: input.date,
      description: input.description,
      reference: input.reference || null,
      branchId: input.branchId || null,
      department: input.department || null,
      createdById: session.staffId,
      saleId: link?.saleId,
      expenseId: link?.expenseId,
      lines: { create: lines },
    },
    include: { lines: { include: { account: true } } },
  });
}

/** Corrections happen via a reversal, never by editing or deleting a posted entry. Creates a new balanced entry with every line's debit/credit flipped. */
export async function reverseJournalEntry(session: SessionPayload, entryId: string, client: DbClient = db) {
  const original = await client.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: true } });
  if (original.reversalOfId) throw new Error("A reversal entry can't itself be reversed.");
  const existingReversal = await client.journalEntry.findFirst({ where: { reversalOfId: entryId } });
  if (existingReversal) throw new Error("This entry has already been reversed.");

  const entryNumber = await nextEntryNumber(client);
  return client.journalEntry.create({
    data: {
      entryNumber,
      date: new Date(),
      description: `Reversal of ${original.entryNumber}: ${original.description}`,
      reference: original.reference,
      branchId: original.branchId,
      department: original.department,
      createdById: session.staffId,
      reversalOfId: original.id,
      lines: {
        create: original.lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit })),
      },
    },
    include: { lines: { include: { account: true } } },
  });
}

/**
 * Auto-posts a sale's revenue (and, when it has one, its cost of goods
 * sold) the moment the sale itself is recorded. Debits Cash for what was
 * actually paid and Accounts Receivable for the rest (a sale is never
 * fully "unpaid" in the ledger sense — whatever isn't paid yet is owed),
 * credits Jewelry Sales for the invoice total, and — when the sold
 * items have a cost basis — debits Cost of Goods Sold and credits
 * Inventory for the sum of their cost prices.
 */
export async function postSaleJournalEntry(
  session: SessionPayload,
  sale: { id: string; invoiceNumber: string; branchId: string; total: number; amountPaid: number; date?: Date },
  costOfGoodsSold: number,
  client: DbClient = db,
) {
  const [cashId, arId, revenueId] = await Promise.all([
    getAccountIdByCode("1000", client),
    getAccountIdByCode("1100", client),
    getAccountIdByCode("4000", client),
  ]);

  const amountPaid = round2(Math.min(sale.amountPaid, sale.total));
  const receivable = round2(Math.max(sale.total - amountPaid, 0));

  const lines: JournalLineInput[] = [];
  if (amountPaid > 0) lines.push({ accountId: cashId, debit: amountPaid, credit: 0 });
  if (receivable > 0) lines.push({ accountId: arId, debit: receivable, credit: 0 });
  lines.push({ accountId: revenueId, debit: 0, credit: sale.total });

  if (costOfGoodsSold > 0) {
    const [cogsId, inventoryId] = await Promise.all([
      getAccountIdByCode("5005", client),
      getAccountIdByCode("1200", client),
    ]);
    lines.push({ accountId: cogsId, debit: costOfGoodsSold, credit: 0 });
    lines.push({ accountId: inventoryId, debit: 0, credit: costOfGoodsSold });
  }

  return postJournalEntry(
    session,
    { date: sale.date ?? new Date(), description: `Sale ${sale.invoiceNumber}`, reference: sale.invoiceNumber, branchId: sale.branchId, lines },
    client,
    { saleId: sale.id },
  );
}

/** Finds the live (unreversed) journal entry for a sale, if any, and reverses it — used when a sale is edited (before posting a fresh entry) or voided. A no-op if the sale was never posted or its entry was already reversed. */
export async function reverseSaleJournalEntry(session: SessionPayload, saleId: string, client: DbClient = db) {
  const entry = await client.journalEntry.findFirst({ where: { saleId } });
  if (!entry) return null;
  const alreadyReversed = await client.journalEntry.findFirst({ where: { reversalOfId: entry.id } });
  if (alreadyReversed) return null;
  return reverseJournalEntry(session, entry.id, client);
}

/** Reverses a sale's current journal entry (if any) and posts a fresh one reflecting its new discount/amountPaid — the only way a posted entry's numbers ever change, since posted entries themselves are never edited. */
export async function repostSaleJournalEntry(
  session: SessionPayload,
  sale: { id: string; invoiceNumber: string; branchId: string; total: number; amountPaid: number },
  costOfGoodsSold: number,
  client: DbClient = db,
) {
  const existing = await client.journalEntry.findFirst({ where: { saleId: sale.id } });
  if (existing) {
    const alreadyReversed = await client.journalEntry.findFirst({ where: { reversalOfId: existing.id } });
    if (!alreadyReversed) await reverseJournalEntry(session, existing.id, client);
    // Free the unique saleId slot so the fresh entry below can claim it; the superseded
    // entry (and its reversal) stay forever, identifiable by entryNumber/reference.
    await client.journalEntry.update({ where: { id: existing.id }, data: { saleId: null } });
  }
  return postSaleJournalEntry(session, sale, costOfGoodsSold, client);
}

/**
 * Auto-posts an expense the moment it's recorded: debits the account its
 * category maps to (falling back to "Other Expenses"; "Purchase order"
 * debits Inventory instead, since that's buying stock, not spending; and
 * "Payroll" debits Salaries), credits Cash for the full amount — expenses
 * in this system are recorded as already paid, with no separate AP step.
 */
export async function postExpenseJournalEntry(
  session: SessionPayload,
  expense: { id: string; category: string; description: string; amount: number; branchId: string; date: Date },
  client: DbClient = db,
) {
  const [debitAccountId, cashId] = await Promise.all([
    resolveExpenseDebitAccountId(expense.category, client),
    getAccountIdByCode("1000", client),
  ]);

  return postJournalEntry(
    session,
    {
      date: expense.date,
      description: expense.description,
      branchId: expense.branchId,
      lines: [
        { accountId: debitAccountId, debit: expense.amount, credit: 0 },
        { accountId: cashId, debit: 0, credit: expense.amount },
      ],
    },
    client,
    { expenseId: expense.id },
  );
}

/** Finds the live (unreversed) journal entry for an expense, if any, and reverses it. A no-op if the expense was never posted or its entry was already reversed. */
export async function reverseExpenseJournalEntry(session: SessionPayload, expenseId: string, client: DbClient = db) {
  const entry = await client.journalEntry.findFirst({ where: { expenseId } });
  if (!entry) return null;
  const alreadyReversed = await client.journalEntry.findFirst({ where: { reversalOfId: entry.id } });
  if (alreadyReversed) return null;
  return reverseJournalEntry(session, entry.id, client);
}

/** Reverses an expense's current journal entry (if any) and posts a fresh one reflecting its new category/amount. */
export async function repostExpenseJournalEntry(
  session: SessionPayload,
  expense: { id: string; category: string; description: string; amount: number; branchId: string; date: Date },
  client: DbClient = db,
) {
  const existing = await client.journalEntry.findFirst({ where: { expenseId: expense.id } });
  if (existing) {
    const alreadyReversed = await client.journalEntry.findFirst({ where: { reversalOfId: existing.id } });
    if (!alreadyReversed) await reverseJournalEntry(session, existing.id, client);
    await client.journalEntry.update({ where: { id: existing.id }, data: { expenseId: null } });
  }
  return postExpenseJournalEntry(session, expense, client);
}
