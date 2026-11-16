/**
 * Populates realistic cross-check data for the Accounting module under two
 * brands — Baza Boutique and Maison Dor — so an Owner (or their accounts
 * team, before handover) can click through every accounting feature with
 * real-looking numbers instead of empty states: Sales and Expenses that
 * auto-post real double-entry journal entries, Purchase Orders with partial
 * payments, manual adjusting Journal Entries, and a batch of unmatched Bank
 * Statement lines to practice Bank Reconciliation on.
 *
 * At least 10 records per entity, per the brand where brand-tagging applies:
 *   - 10 customers + 10 inventory items + 10 sales PER BRAND (20 of each)
 *   - 10 expenses PER BRAND (20 total), spanning every expense category
 *   - 10 suppliers + 10 purchase orders (with varying payment status)
 *   - 10 manual journal entries (adjusting/correction-style postings)
 *   - 10 bank statement lines on the Cash account, left unmatched so the
 *     accounts team can practice Bank Reconciliation's matching workflow
 *     themselves (some have an exact-amount match waiting; a couple don't,
 *     to exercise the "no match found" / discard path too)
 *
 * Everything this script creates is tagged "[ACCT-DEMO]" (in notes/
 * descriptions) and uses the @acct-demo.test email domain / ACCTDEMO- SKU
 * prefix, so it's unmistakably test data and easy to find again. Running it
 * twice is a no-op (it exits early if the tag is already present). Use
 * accounting-demo-cleanup.ts to remove everything it created.
 *
 * Does NOT import any app code ("server-only" modules can't be used outside
 * Next's own bundler) — it reimplements the same debit/credit construction
 * that src/lib/ledger.ts uses for real posting, reviewed line-for-line
 * against it, so the resulting books are exactly as internally consistent
 * as a real sale/expense would produce.
 *
 * Run inside the app container:
 *   docker compose exec app node_modules/.bin/tsx prisma/accounting-demo-data.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TAG = "[ACCT-DEMO]";
const DEMO_EMAIL_DOMAIN = "@acct-demo.test";
const SKU_PREFIX = "ACCTDEMO-";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 30, 0, 0);
  return d;
}

let invoiceSeq = 0;
function invoiceNumber() {
  invoiceSeq += 1;
  return `INV-ACCTDEMO-${String(invoiceSeq).padStart(4, "0")}`;
}
let poSeq = 0;
function poNumber() {
  poSeq += 1;
  return `PO-ACCTDEMO-${String(poSeq).padStart(4, "0")}`;
}

const EXPENSE_NAME_TO_CODE: Record<string, string> = {
  salaries: "5000", rent: "5010", marketing: "5020", transportation: "5030", utilities: "5040",
  packaging: "5050", administration: "5060", "workshop expenses": "5070", "bank charges": "5080",
  "other expenses": "5900",
};
const EXPENSE_CATEGORY_OVERRIDES: Record<string, string> = { "purchase order": "1200", payroll: "5000" };

function resolveExpenseDebitCode(category: string): string {
  const key = category.trim().toLowerCase();
  return EXPENSE_CATEGORY_OVERRIDES[key] ?? EXPENSE_NAME_TO_CODE[key] ?? "5900";
}

async function main() {
  const already = await db.customer.findFirst({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } });
  if (already) {
    console.log(`Accounting cross-check demo data already exists (found a customer @${DEMO_EMAIL_DOMAIN}) — skipping. Nothing changed.`);
    return;
  }

  const owner = await db.staff.findFirst({ where: { role: "OWNER" } });
  const branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  if (!owner || branches.length === 0) {
    throw new Error("No Owner account / branch found. Complete first-boot setup before running this.");
  }

  // Idempotent — same defaults as src/lib/ledger.ts's seedDefaultAccounts, duplicated here since that
  // module can't be imported outside Next's bundler. Only inserts codes that don't already exist.
  const DEFAULT_ACCOUNTS: { code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" }[] = [
    { code: "1000", name: "Cash", type: "ASSET" }, { code: "1010", name: "Bank", type: "ASSET" },
    { code: "1020", name: "Petty Cash", type: "ASSET" }, { code: "1100", name: "Accounts Receivable", type: "ASSET" },
    { code: "1200", name: "Inventory", type: "ASSET" }, { code: "1500", name: "Fixed Assets", type: "ASSET" },
    { code: "1900", name: "Other Assets", type: "ASSET" }, { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
    { code: "2100", name: "Customer Advances", type: "LIABILITY" }, { code: "2200", name: "Outstanding Salaries", type: "LIABILITY" },
    { code: "2900", name: "Other Liabilities", type: "LIABILITY" }, { code: "3000", name: "Owner's Capital", type: "EQUITY" },
    { code: "3100", name: "Retained Earnings", type: "EQUITY" }, { code: "3200", name: "Current Year Earnings", type: "EQUITY" },
    { code: "3300", name: "Historical Data Suspense", type: "EQUITY" },
    { code: "4000", name: "Jewelry Sales", type: "INCOME" }, { code: "4010", name: "Gemstone Sales", type: "INCOME" },
    { code: "4020", name: "Custom Orders", type: "INCOME" }, { code: "4030", name: "Workshop Income", type: "INCOME" },
    { code: "4900", name: "Other Income", type: "INCOME" }, { code: "5000", name: "Salaries", type: "EXPENSE" },
    { code: "5005", name: "Cost of Goods Sold", type: "EXPENSE" }, { code: "5010", name: "Rent", type: "EXPENSE" },
    { code: "5020", name: "Marketing", type: "EXPENSE" }, { code: "5030", name: "Transportation", type: "EXPENSE" },
    { code: "5040", name: "Utilities", type: "EXPENSE" }, { code: "5050", name: "Packaging", type: "EXPENSE" },
    { code: "5060", name: "Administration", type: "EXPENSE" }, { code: "5070", name: "Workshop Expenses", type: "EXPENSE" },
    { code: "5080", name: "Bank Charges", type: "EXPENSE" }, { code: "5900", name: "Other Expenses", type: "EXPENSE" },
  ];
  const existingCodes = new Set((await db.account.findMany({ select: { code: true } })).map((a) => a.code));
  const toSeed = DEFAULT_ACCOUNTS.filter((a) => !existingCodes.has(a.code));
  if (toSeed.length > 0) {
    await db.account.createMany({ data: toSeed.map((a) => ({ ...a, isSystem: true })) });
    console.log(`  Seeded ${toSeed.length} missing Chart of Accounts entries first.`);
  }

  const accounts = await db.account.findMany();
  const acctByCode = new Map(accounts.map((a) => [a.code, a]));
  function accountId(code: string): string {
    const a = acctByCode.get(code);
    if (!a) throw new Error(`Account ${code} doesn't exist yet — seed the Chart of Accounts first (Accounting → Setup).`);
    return a.id;
  }

  const allBrands = await db.brand.findMany();
  const bazaBrand = allBrands.find((b) => b.name.toLowerCase().includes("baza"));
  const maisonBrand = allBrands.find((b) => b.name.toLowerCase().includes("maison"));
  if (!bazaBrand || !maisonBrand) {
    throw new Error(`Couldn't find both brands. Found: ${allBrands.map((b) => b.name).join(", ") || "(none)"}`);
  }
  const brandList = [
    { brand: bazaBrand, label: "Baza Boutique" },
    { brand: maisonBrand, label: "Maison Dor" },
  ];

  let entrySeq = await db.journalEntry.count();
  function nextEntryNumber() {
    entrySeq += 1;
    return `JE-${String(entrySeq).padStart(6, "0")}`;
  }

  /** A balanced double-entry posting — same shape/validation as src/lib/ledger.ts's postJournalEntry. */
  async function postJE(input: {
    date: Date; description: string; reference?: string; branchId?: string;
    lines: { accountId: string; debit: number; credit: number }[];
  }, link?: { saleId?: string; expenseId?: string }) {
    const lines = input.lines.map((l) => ({ ...l, debit: round2(l.debit), credit: round2(l.credit) }));
    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    if (totalDebit !== totalCredit) throw new Error(`Entry "${input.description}" is unbalanced: ${totalDebit} vs ${totalCredit}`);
    return db.journalEntry.create({
      data: {
        entryNumber: nextEntryNumber(), date: input.date, description: input.description,
        reference: input.reference ?? null, branchId: input.branchId ?? null, createdById: owner!.id,
        saleId: link?.saleId, expenseId: link?.expenseId,
        lines: { create: lines },
      },
    });
  }

  async function recordSale(opts: {
    branchId: string; brandId: string; customerId: string; itemId: string;
    qty: number; priceEach: number; costPrice: number; discount: number; amountPaid: number; date: Date;
  }) {
    const subtotal = round2(opts.priceEach * opts.qty);
    const total = round2(Math.max(subtotal - opts.discount, 0));
    const amountPaid = round2(Math.min(opts.amountPaid, total));
    const paymentStatus = amountPaid >= total ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID";
    const invNum = invoiceNumber();

    const sale = await db.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          invoiceNumber: invNum, customerId: opts.customerId, branchId: opts.branchId, brandId: opts.brandId,
          staffId: owner!.id, subtotal, discount: opts.discount, tax: 0, total, amountPaid, paymentStatus,
          paymentMethod: "CASH", notes: TAG, createdAt: opts.date,
          items: { create: [{ inventoryItemId: opts.itemId, quantity: opts.qty, priceEach: opts.priceEach }] },
        },
      });
      const updated = await tx.inventoryItem.update({ where: { id: opts.itemId }, data: { quantity: { decrement: opts.qty } } });
      if (updated.quantity <= 0) await tx.inventoryItem.update({ where: { id: opts.itemId }, data: { status: "SOLD" } });
      await tx.ledgerEntry.create({
        data: { branchId: opts.branchId, type: "INCOME", amount: total, description: `Sale ${invNum}`, saleId: created.id, date: opts.date },
      });
      return created;
    });

    const receivable = round2(Math.max(total - amountPaid, 0));
    const costOfGoodsSold = round2(opts.costPrice * opts.qty);
    const lines: { accountId: string; debit: number; credit: number }[] = [];
    if (amountPaid > 0) lines.push({ accountId: accountId("1000"), debit: amountPaid, credit: 0 });
    if (receivable > 0) lines.push({ accountId: accountId("1100"), debit: receivable, credit: 0 });
    lines.push({ accountId: accountId("4000"), debit: 0, credit: total });
    if (costOfGoodsSold > 0) {
      lines.push({ accountId: accountId("5005"), debit: costOfGoodsSold, credit: 0 });
      lines.push({ accountId: accountId("1200"), debit: 0, credit: costOfGoodsSold });
    }
    await postJE({ date: opts.date, description: `Sale ${invNum}`, reference: invNum, branchId: opts.branchId, lines }, { saleId: sale.id });
    return sale;
  }

  async function recordExpense(opts: { branchId: string; brandId?: string; category: string; description: string; amount: number; date: Date }) {
    const description = `${TAG} ${opts.description}`;
    const expense = await db.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: { branchId: opts.branchId, brandId: opts.brandId, category: opts.category, description, amount: opts.amount, date: opts.date, createdById: owner!.id, createdAt: opts.date },
      });
      await tx.ledgerEntry.create({
        data: { branchId: opts.branchId, type: "EXPENSE", amount: opts.amount, description: `${opts.category}: ${description}`, date: opts.date, expenseId: created.id },
      });
      return created;
    });
    await postJE(
      {
        date: opts.date, description: `${opts.category}: ${description}`, branchId: opts.branchId,
        lines: [
          { accountId: accountId(resolveExpenseDebitCode(opts.category)), debit: opts.amount, credit: 0 },
          { accountId: accountId("1000"), debit: 0, credit: opts.amount },
        ],
      },
      { expenseId: expense.id },
    );
    return expense;
  }

  console.log("Seeding Accounting cross-check demo data for Baza Boutique and Maison Dor...");

  const CUSTOMER_NAMES = [
    "Nimali Senanayake", "Roshan Dissanayake", "Anoma Wickramasinghe", "Lakshman Bandara", "Kumari Jayathilaka",
    "Chinthaka Gunawardena", "Sanduni Ekanayake", "Mahesh Ratnayake", "Thilini Herath", "Nuwan Abeywickrama",
  ];
  const ITEM_TEMPLATES: { name: string; category: "RING" | "NECKLACE" | "EARRING" | "BRACELET" | "BANGLE" | "PENDANT"; cost: number; price: number }[] = [
    { name: "Sapphire Halo Ring", category: "RING", cost: 52000, price: 78000 },
    { name: "Temple Jewellery Necklace", category: "NECKLACE", cost: 140000, price: 195000 },
    { name: "Drop Pearl Earrings", category: "EARRING", cost: 28000, price: 42000 },
    { name: "Rose Gold Tennis Bracelet", category: "BRACELET", cost: 61000, price: 89000 },
    { name: "Kandyan Bangle Pair", category: "BANGLE", cost: 72000, price: 101000 },
    { name: "Emerald Drop Pendant", category: "PENDANT", cost: 45000, price: 66000 },
    { name: "Twist Band Ring", category: "RING", cost: 30000, price: 46000 },
    { name: "Layered Chain Necklace", category: "NECKLACE", cost: 58000, price: 82000 },
    { name: "Gold Hoop Earrings", category: "EARRING", cost: 19000, price: 29000 },
    { name: "Cuff Bracelet", category: "BRACELET", cost: 40000, price: 59000 },
  ];
  const EXPENSE_CATEGORIES: { category: string; description: string; amount: number }[] = [
    { category: "Rent", description: "Monthly shop rent", amount: 90000 },
    { category: "Utilities", description: "Electricity bill", amount: 14500 },
    { category: "Marketing", description: "Instagram & Facebook ad boost", amount: 8500 },
    { category: "Transportation", description: "Courier for customer deliveries", amount: 3200 },
    { category: "Packaging", description: "Gift boxes and pouches", amount: 6100 },
    { category: "Administration", description: "Office supplies and stationery", amount: 2800 },
    { category: "Workshop Expenses", description: "Polishing and setting tools", amount: 11200 },
    { category: "Bank Charges", description: "Monthly card processing fee", amount: 1500 },
    { category: "Salaries", description: "Part-time sales assistant wages", amount: 45000 },
    { category: "Other Expenses", description: "Miscellaneous shop supplies", amount: 4300 },
  ];
  // Spread across AR/AP aging buckets: current, 31-60, 61-90, over 90 days.
  const AGE_SPREAD = [5, 12, 20, 35, 45, 58, 70, 85, 95, 110];

  let salesTotal = 0;
  let expensesTotal = 0;
  let customersTotal = 0;
  let itemsTotal = 0;

  for (let bi = 0; bi < brandList.length; bi++) {
    const { brand, label } = brandList[bi];
    const branch = branches[bi % branches.length];

    const customers = [];
    for (let i = 0; i < 10; i++) {
      const name = `${TAG} ${CUSTOMER_NAMES[i]} (${label})`;
      const c = await db.customer.create({
        data: {
          name, branchId: branch.id,
          phone: `077-${String(1000000 + bi * 10000 + i).slice(-7)}`,
          email: `acctdemo.${label.toLowerCase().replace(/\s+/g, "")}.${i + 1}${DEMO_EMAIL_DOMAIN}`,
        },
      });
      customers.push(c);
    }
    customersTotal += customers.length;

    const items = [];
    for (let i = 0; i < 10; i++) {
      const t = ITEM_TEMPLATES[i];
      const item = await db.inventoryItem.create({
        data: {
          sku: `${SKU_PREFIX}${label === "Baza Boutique" ? "BB" : "MD"}-${String(i + 1).padStart(3, "0")}`,
          name: `${t.name} (${label})`, category: t.category, costPrice: t.cost, sellingPrice: t.price,
          quantity: 3, branchId: branch.id, brandId: brand.id, notes: TAG,
        },
      });
      items.push(item);
    }
    itemsTotal += items.length;

    for (let i = 0; i < 10; i++) {
      const t = ITEM_TEMPLATES[i];
      const amountPaid = i % 4 === 0 ? 0 : i % 3 === 0 ? round2(t.price * 0.5) : t.price;
      await recordSale({
        branchId: branch.id, brandId: brand.id, customerId: customers[i].id, itemId: items[i].id,
        qty: 1, priceEach: t.price, costPrice: t.cost, discount: i % 5 === 0 ? round2(t.price * 0.05) : 0,
        amountPaid, date: daysAgo(AGE_SPREAD[i]),
      });
      salesTotal += 1;
    }

    for (let i = 0; i < 10; i++) {
      const e = EXPENSE_CATEGORIES[i];
      await recordExpense({ branchId: branch.id, brandId: brand.id, category: e.category, description: `${e.description} — ${label}`, amount: e.amount, date: daysAgo(AGE_SPREAD[i]) });
      expensesTotal += 1;
    }
    console.log(`  ${label}: 10 customers, 10 inventory items, 10 sales, 10 expenses created`);
  }

  // --- Suppliers & Purchase Orders (not brand-specific in this schema) ----
  const SUPPLIER_NAMES = [
    "Golden Horizon Metals", "Ratna Gem Exports", "Colombo Casting Works", "Indo-Lanka Bullion",
    "Kandy Stone Cutters", "Pearl Coast Traders", "Royal Setting Studio", "Lanka Platinum Supply",
    "Heritage Gold Refiners", "Star Sapphire Wholesale",
  ];
  const defaultBranch = branches[0];
  const suppliers = [];
  for (let i = 0; i < 10; i++) {
    const s = await db.supplier.create({
      data: { name: `${TAG} ${SUPPLIER_NAMES[i]}`, contactName: `Contact Person ${i + 1}`, phone: `011-${String(2000000 + i).slice(-7)}`, email: `supplier${i + 1}${DEMO_EMAIL_DOMAIN}` },
    });
    suppliers.push(s);
  }

  let poTotal = 0;
  for (let i = 0; i < 10; i++) {
    const totalAmount = 50000 + i * 15000;
    const po = await db.purchaseOrder.create({
      data: {
        orderNumber: poNumber(), supplierId: suppliers[i].id, branchId: defaultBranch.id, status: i % 5 === 0 ? "ORDERED" : "RECEIVED",
        totalAmount, orderDate: daysAgo(AGE_SPREAD[i]), createdById: owner.id, notes: TAG,
        items: { create: [{ description: `${TAG} Raw material batch #${i + 1}`, quantity: 1, unitCost: totalAmount }] },
      },
    });
    const amountPaid = i % 3 === 0 ? 0 : i % 2 === 0 ? round2(totalAmount * 0.5) : totalAmount;
    if (amountPaid > 0) {
      await recordExpense({
        branchId: defaultBranch.id, category: "Purchase order",
        description: `Payment for ${po.orderNumber} — ${suppliers[i].name}`, amount: amountPaid, date: daysAgo(Math.max(AGE_SPREAD[i] - 1, 0)),
      });
      await db.purchaseOrder.update({ where: { id: po.id }, data: { amountPaid } });
    }
    poTotal += 1;
  }

  // --- Manual Journal Entries (adjusting/correction-style postings) -------
  const MANUAL_ENTRIES: { description: string; lines: { code: string; debit: number; credit: number }[] }[] = [
    { description: "Cash deposited into Bank", lines: [{ code: "1010", debit: 25000, credit: 0 }, { code: "1000", debit: 0, credit: 25000 }] },
    { description: "Petty cash top-up from Bank", lines: [{ code: "1020", debit: 5000, credit: 0 }, { code: "1010", debit: 0, credit: 5000 }] },
    { description: "Owner's Capital contribution", lines: [{ code: "1010", debit: 100000, credit: 0 }, { code: "3000", debit: 0, credit: 100000 }] },
    { description: "Correcting entry: bank charge misposted last month", lines: [{ code: "5080", debit: 750, credit: 0 }, { code: "1010", debit: 0, credit: 750 }] },
    { description: "Cash deposited into Bank (second batch)", lines: [{ code: "1010", debit: 18000, credit: 0 }, { code: "1000", debit: 0, credit: 18000 }] },
    { description: "Transfer from Bank to Petty Cash", lines: [{ code: "1020", debit: 3000, credit: 0 }, { code: "1010", debit: 0, credit: 3000 }] },
    { description: "Write-off of uncollectible customer balance", lines: [{ code: "3100", debit: 4500, credit: 0 }, { code: "1100", debit: 0, credit: 4500 }] },
    { description: "Owner's Capital contribution (second batch)", lines: [{ code: "1000", debit: 50000, credit: 0 }, { code: "3000", debit: 0, credit: 50000 }] },
    { description: "Correcting entry: utilities overstated", lines: [{ code: "1000", debit: 1200, credit: 0 }, { code: "5040", debit: 0, credit: 1200 }] },
    { description: "Cash deposited into Bank (third batch)", lines: [{ code: "1010", debit: 32000, credit: 0 }, { code: "1000", debit: 0, credit: 32000 }] },
  ];
  for (let i = 0; i < MANUAL_ENTRIES.length; i++) {
    const m = MANUAL_ENTRIES[i];
    await postJE({
      date: daysAgo(100 - i * 8), description: `${TAG} ${m.description}`, branchId: defaultBranch.id,
      lines: m.lines.map((l) => ({ accountId: accountId(l.code), debit: l.debit, credit: l.credit })),
    });
  }

  // --- Bank statement lines (left unmatched for hands-on reconciliation practice) ---
  const BANK_LINES: { description: string; amount: number; daysAgoVal: number }[] = [
    { description: "Cash deposited into Bank", amount: 25000, daysAgoVal: 100 },
    { description: "Petty cash top-up from Bank", amount: -5000, daysAgoVal: 92 },
    { description: "Owner's Capital contribution", amount: 100000, daysAgoVal: 84 },
    { description: "Cash deposited into Bank (second batch)", amount: 18000, daysAgoVal: 60 },
    { description: "Transfer from Bank to Petty Cash", amount: -3000, daysAgoVal: 52 },
    { description: "Cash deposited into Bank (third batch)", amount: 32000, daysAgoVal: 20 },
    { description: "Bank service charge — not yet in the books", amount: -450, daysAgoVal: 15 },
    { description: "Unidentified deposit — needs follow-up", amount: 7250, daysAgoVal: 10 },
    { description: "Card settlement batch", amount: 62000, daysAgoVal: 6 },
    { description: "Standing order — insurance premium", amount: -9800, daysAgoVal: 3 },
  ];
  await db.bankStatementLine.createMany({
    data: BANK_LINES.map((b) => ({
      accountId: accountId("1010"), date: daysAgo(b.daysAgoVal), description: `${TAG} ${b.description}`,
      amount: b.amount, uploadedById: owner!.id,
    })),
  });

  console.log("\nDone.");
  console.log(`  Customers: ${customersTotal}`);
  console.log(`  Inventory items: ${itemsTotal}`);
  console.log(`  Sales: ${salesTotal}`);
  console.log(`  Expenses (brand): ${expensesTotal}`);
  console.log(`  Suppliers: ${suppliers.length}`);
  console.log(`  Purchase orders: ${poTotal}`);
  console.log(`  Manual journal entries: ${MANUAL_ENTRIES.length}`);
  console.log(`  Bank statement lines (unmatched, on Bank 1010): ${BANK_LINES.length}`);
  console.log("\nEverything is tagged \"[ACCT-DEMO]\" — run accounting-demo-cleanup.ts to remove it later.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
