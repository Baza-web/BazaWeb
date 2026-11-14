/**
 * Populates realistic sample data across every module — customers, inventory,
 * sales, accounting, tasks, repairs, purchasing, brokers & memos, and more —
 * so an Owner/Admin can click through the whole app and see it working with
 * real-looking numbers instead of empty states.
 *
 * Safe to run once on a live system: everything it creates is tagged "Demo"
 * (staff emails end in @example.com, inventory SKUs start with DEMO-), it
 * never touches your real Owner account or existing records, and running it
 * a second time is a no-op (it exits early if the demo data is already there).
 * It's ordinary data once created — there's no one-click "undo", so ask for
 * a cleanup script when you're ready to remove it rather than deleting rows
 * by hand (several tables reference each other).
 *
 * Run inside the app container:
 *   docker compose exec app node_modules/.bin/tsx prisma/demo-data.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const db = new PrismaClient();

const DEMO_PASSWORD = "Demo@12345";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function docNumber(prefix: string) {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${random}`;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function main() {
  const existing = await db.staff.findUnique({ where: { email: "admin.demo@example.com" } });
  if (existing) {
    console.log("Demo data already exists (found admin.demo@example.com) — skipping. Nothing changed.");
    return;
  }

  const owner = await db.staff.findFirst({ where: { role: "OWNER" } });
  const branch = await db.branch.findFirst({ orderBy: { createdAt: "asc" } });
  if (!owner || !branch) {
    throw new Error(
      "No Owner account / branch found yet. Complete first-boot setup (sign in as the seeded Owner at least once) before running this.",
    );
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  console.log(`Adding demo data to "${branch.name}"...`);

  // --- Staff ------------------------------------------------------------
  const admin = await db.staff.create({
    data: { name: "Nadeesha Perera", email: "admin.demo@example.com", passwordHash, role: "ADMIN", branchId: branch.id },
  });
  const manager = await db.staff.create({
    data: { name: "Kasun Fernando", email: "manager.demo@example.com", passwordHash, role: "MANAGER", branchId: branch.id },
  });
  const sales = await db.staff.create({
    data: { name: "Dilani Silva", email: "sales.demo@example.com", passwordHash, role: "SALES", branchId: branch.id },
  });
  const accountant = await db.staff.create({
    data: { name: "Ruwan Jayawardena", email: "accountant.demo@example.com", passwordHash, role: "ACCOUNTANT", branchId: branch.id },
  });
  const craftsman = await db.staff.create({
    data: { name: "Sunil Rathnayake", email: "craftsman.demo@example.com", passwordHash, role: "CRAFTSMAN", branchId: branch.id },
  });
  console.log(`  5 demo staff created (password for all: ${DEMO_PASSWORD})`);

  // --- Customers ----------------------------------------------------------
  const [cust1, cust2, cust3, cust4, cust5] = await Promise.all([
    db.customer.create({
      data: {
        name: "Anusha Wickramasinghe",
        phone: "077 123 4567",
        email: "anusha.demo@example.com",
        address: "14 Temple Road, Colombo 06",
        birthday: daysFromNow(5),
        branchId: branch.id,
      },
    }),
    db.customer.create({
      data: {
        name: "Priyantha Gunasekara",
        phone: "071 234 5678",
        address: "88 Galle Road, Mount Lavinia",
        anniversary: daysFromNow(9),
        branchId: branch.id,
      },
    }),
    db.customer.create({
      data: { name: "Chamari Rajapaksha", phone: "076 345 6789", branchId: branch.id },
    }),
    db.customer.create({
      data: { name: "Harsha Bandara", phone: "070 456 7890", address: "22 Kandy Road, Kadawatha", branchId: branch.id },
    }),
    db.customer.create({
      data: { name: "Nilushi De Silva", phone: "075 567 8901", email: "nilushi.demo@example.com", branchId: branch.id },
    }),
  ]);
  await db.customerNote.create({
    data: {
      customerId: cust1.id,
      staffId: sales.id,
      body: "Interested in a matching ring for her anniversary set — follow up with new arrivals.",
      followUpAt: daysFromNow(14),
    },
  });
  console.log("  5 demo customers + 1 note created");

  // --- Inventory ------------------------------------------------------
  const ring = await db.inventoryItem.create({
    data: {
      sku: "DEMO-RG001", name: "Kandyan Lotus Ring", category: "RING",
      metalType: "Gold", metalPurity: "22K", grossWeightG: 5.2, netWeightG: 4.9,
      costPrice: 45000, sellingPrice: 68000, quantity: 3, lowStockAt: 1, branchId: branch.id,
    },
  });
  const necklace = await db.inventoryItem.create({
    data: {
      sku: "DEMO-NK001", name: "Nagapadam Temple Necklace", category: "NECKLACE",
      metalType: "Gold", metalPurity: "22K", grossWeightG: 42, netWeightG: 40,
      costPrice: 120000, sellingPrice: 175000, quantity: 1, lowStockAt: 1, branchId: branch.id,
      notes: "One-of-a-kind piece — handcrafted traditional temple jewellery design.",
    },
  });
  const earrings = await db.inventoryItem.create({
    data: {
      sku: "DEMO-ER001", name: "Solitaire Diamond Drop Earrings", category: "EARRING",
      metalType: "White Gold", metalPurity: "18K", gemstoneType: "Diamond", caratWeight: 0.5,
      clarity: "VS1", cut: "Round Brilliant", certification: "GIA",
      costPrice: 85000, sellingPrice: 125000, quantity: 2, lowStockAt: 1, branchId: branch.id,
    },
  });
  const bangle = await db.inventoryItem.create({
    data: {
      sku: "DEMO-BG001", name: "Classic Gold Bangle Set", category: "BANGLE",
      metalType: "Gold", metalPurity: "22K", grossWeightG: 28,
      costPrice: 30000, sellingPrice: 42000, quantity: 1, lowStockAt: 2, branchId: branch.id,
    },
  });
  const bracelet = await db.inventoryItem.create({
    data: {
      sku: "DEMO-BR001", name: "Tennis Bracelet", category: "BRACELET",
      metalType: "White Gold", metalPurity: "18K", gemstoneType: "Cubic Zirconia",
      costPrice: 65000, sellingPrice: 95000, quantity: 2, lowStockAt: 1, branchId: branch.id,
    },
  });
  const pendant = await db.inventoryItem.create({
    data: {
      sku: "DEMO-PD001", name: "Ceylon Blue Sapphire Pendant", category: "PENDANT",
      metalType: "Gold", metalPurity: "18K", gemstoneType: "Blue Sapphire", caratWeight: 2.1,
      clarity: "Eye Clean", certification: "GIA",
      costPrice: 95000, sellingPrice: 140000, quantity: 1, lowStockAt: 1, branchId: branch.id,
    },
  });
  const looseStone = await db.inventoryItem.create({
    data: {
      sku: "DEMO-LS001", name: "Loose Ceylon Blue Sapphire 3.4ct", category: "LOOSE_STONE",
      gemstoneType: "Ceylon Blue Sapphire", caratWeight: 3.4, clarity: "VVS", cut: "Oval",
      certification: "GIA Certified", costPrice: 60000, sellingPrice: 90000, quantity: 1, lowStockAt: 1,
      branchId: branch.id,
    },
  });
  console.log("  7 demo inventory items created (spanning categories, low-stock, single-piece)");

  // --- Sales (mirrors createSale: decrement stock, SOLD at zero, ledger INCOME) ---
  async function recordSale(opts: {
    item: typeof ring; qty: number; priceEach: number; customerId?: string; staffId: string;
    discount?: number; amountPaid: number; paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER" | "MOBILE_MONEY";
    createdAt: Date;
  }) {
    const subtotal = round2(opts.priceEach * opts.qty);
    const discount = round2(opts.discount ?? 0);
    const total = round2(Math.max(subtotal - discount, 0));
    const amountPaid = round2(opts.amountPaid);
    const paymentStatus = amountPaid >= total ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID";
    const invoiceNumber = docNumber("INV");

    await db.$transaction(async (tx) => {
      const createdSale = await tx.sale.create({
        data: {
          invoiceNumber, customerId: opts.customerId, branchId: branch!.id, staffId: opts.staffId,
          subtotal, discount, tax: 0, total, amountPaid, paymentStatus,
          paymentMethod: opts.paymentMethod, createdAt: opts.createdAt,
          items: { create: [{ inventoryItemId: opts.item.id, quantity: opts.qty, priceEach: opts.priceEach }] },
        },
      });
      const updated = await tx.inventoryItem.update({
        where: { id: opts.item.id }, data: { quantity: { decrement: opts.qty } },
      });
      if (updated.quantity <= 0) await tx.inventoryItem.update({ where: { id: opts.item.id }, data: { status: "SOLD" } });
      await tx.ledgerEntry.create({
        data: { branchId: branch!.id, type: "INCOME", amount: total, description: `Sale ${invoiceNumber}`, saleId: createdSale.id, date: opts.createdAt },
      });
    });
  }

  await recordSale({ item: ring, qty: 1, priceEach: 68000, customerId: cust1.id, staffId: sales.id, amountPaid: 68000, paymentMethod: "CASH", createdAt: daysAgo(6) });
  await recordSale({ item: earrings, qty: 1, priceEach: 125000, customerId: cust2.id, staffId: sales.id, discount: 5000, amountPaid: 60000, paymentMethod: "CARD", createdAt: daysAgo(4) });
  await recordSale({ item: bracelet, qty: 1, priceEach: 95000, customerId: cust3.id, staffId: manager.id, amountPaid: 0, paymentMethod: "BANK_TRANSFER", createdAt: daysAgo(2) });
  await recordSale({ item: necklace, qty: 1, priceEach: 175000, staffId: sales.id, amountPaid: 175000, paymentMethod: "MOBILE_MONEY", createdAt: daysAgo(1) });
  console.log("  4 demo sales recorded (PAID/PARTIAL/UNPAID, stock decremented, ledger updated)");

  // --- Expenses (mirrors createExpense: Expense + ledger EXPENSE) -------
  async function recordExpense(category: string, description: string, amount: number, date: Date) {
    await db.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: { branchId: branch!.id, category, description, amount, date, createdById: accountant.id, createdAt: date },
      });
      await tx.ledgerEntry.create({
        data: { branchId: branch!.id, type: "EXPENSE", amount, description: `${category}: ${description}`, date, expenseId: expense.id },
      });
    });
  }
  await recordExpense("Rent", "November shop rent", 85000, daysAgo(10));
  await recordExpense("Utilities", "Electricity bill", 12500, daysAgo(7));
  await recordExpense("Marketing", "Facebook & Instagram ad boost", 5000, daysAgo(3));
  console.log("  3 demo expenses recorded");

  // --- Suppliers & Purchase Orders ---------------------------------------
  const supplier1 = await db.supplier.create({
    data: { name: "Ceylon Gold Traders", contactName: "Mr. Wijesinghe", phone: "011 234 5678", address: "Sea Street, Colombo 11" },
  });
  const supplier2 = await db.supplier.create({
    data: { name: "Lanka Gem Importers", contactName: "Mrs. Abeysekara", phone: "011 876 5432" },
  });

  const po1 = await db.purchaseOrder.create({
    data: {
      orderNumber: docNumber("PO"), supplierId: supplier1.id, branchId: branch.id, status: "RECEIVED",
      totalAmount: 480000, createdById: accountant.id, orderDate: daysAgo(12),
      items: { create: [{ description: "22K Gold Casting Wire (10g bars)", quantity: 10, unitCost: 48000 }] },
    },
  });
  await db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: { branchId: branch!.id, category: "Purchase order", description: `Payment for ${po1.orderNumber} — ${supplier1.name}`, amount: 300000, createdById: accountant.id, purchaseOrderId: po1.id, date: daysAgo(11), createdAt: daysAgo(11) },
    });
    await tx.ledgerEntry.create({
      data: { branchId: branch!.id, type: "EXPENSE", amount: 300000, description: `${po1.orderNumber}: payment to ${supplier1.name}`, date: daysAgo(11), expenseId: expense.id },
    });
    await tx.purchaseOrder.update({ where: { id: po1.id }, data: { amountPaid: 300000 } });
  });

  await db.purchaseOrder.create({
    data: {
      orderNumber: docNumber("PO"), supplierId: supplier2.id, branchId: branch.id, status: "ORDERED",
      expectedDate: daysFromNow(7), totalAmount: 175000, createdById: accountant.id, orderDate: daysAgo(2),
      items: { create: [{ description: "Natural Blue Sapphire parcel (5 stones)", quantity: 5, unitCost: 35000 }] },
    },
  });
  console.log("  2 suppliers + 2 purchase orders created (one RECEIVED with a payment, one still ORDERED to try the workflow on)");

  // --- Staff Group --------------------------------------------------------
  const group = await db.staffGroup.create({
    data: { name: "Showroom Team", branchId: branch.id, members: { connect: [{ id: sales.id }, { id: manager.id }] } },
  });
  console.log("  1 staff group created (Showroom Team)");

  // --- Tasks ----------------------------------------------------------
  const t1 = await db.task.create({
    data: { title: "Polish display counter", type: "DAILY", status: "PENDING", branchId: branch.id, assignedToId: sales.id, assignedById: manager.id },
  });
  await db.task.create({
    data: { title: "Restock gift boxes & pouches", type: "DAILY", status: "DONE", branchId: branch.id, assignedToId: sales.id, assignedById: manager.id, completedAt: daysAgo(1) },
  });
  await db.task.create({
    data: { title: "Repair intake follow-up call", type: "SPECIAL", status: "IN_PROGRESS", priority: "HIGH", dueDate: daysFromNow(2), branchId: branch.id, assignedToId: manager.id, assignedById: admin.id },
  });
  await db.task.create({
    data: { title: "Prepare month-end accounts", type: "SPECIAL", status: "PENDING", priority: "URGENT", dueDate: daysFromNow(3), branchId: branch.id, assignedToId: accountant.id, assignedById: admin.id },
  });
  await db.task.create({
    data: { title: "Clean & oil workshop tools", type: "DAILY", status: "PENDING", branchId: branch.id, assignedToId: craftsman.id, assignedById: manager.id },
  });
  await db.task.create({
    data: { title: "Train new hire on the POS system", type: "SPECIAL", status: "PENDING", priority: "NORMAL", dueDate: daysFromNow(5), branchId: branch.id, assignedToId: manager.id, assignedById: admin.id, groupId: group.id },
  });
  await db.taskComment.create({
    data: { taskId: t1.id, staffId: manager.id, body: "Please do this before the weekend rush — thanks!" },
  });
  console.log("  6 demo tasks created (all statuses/priorities) + 1 comment");

  // --- Messages & Notifications -------------------------------------------
  await db.message.create({ data: { senderId: manager.id, recipientId: sales.id, body: "Please restock the gift boxes before Friday." } });
  await db.message.create({ data: { senderId: sales.id, recipientId: manager.id, body: "Done! Restocked this morning." } });
  await db.notification.createMany({
    data: [
      { staffId: owner.id, type: "LOW_STOCK", title: "Low stock alert", body: `${bangle.name} (${bangle.sku}) is down to 1 unit.`, link: `/inventory/${bangle.id}` },
      { staffId: owner.id, type: "SALE_CREATED", title: "New sale recorded", body: `${sales.name} recorded a sale for Kandyan Lotus Ring.`, link: "/sales" },
      { staffId: owner.id, type: "SYSTEM", title: "New broker memo issued", body: "A demo broker memo was issued — see Brokers & Memos.", link: "/brokers" },
    ],
  });
  console.log("  2 demo messages + 3 notifications created for the Owner inbox");

  // --- Leave requests -------------------------------------------------
  await db.leaveRequest.create({
    data: { staffId: sales.id, type: "VACATION", startDate: daysFromNow(10), endDate: daysFromNow(13), reason: "Family trip to Kandy.", status: "PENDING" },
  });
  await db.leaveRequest.create({
    data: { staffId: craftsman.id, type: "SICK", startDate: daysAgo(5), endDate: daysAgo(4), reason: "Flu.", status: "APPROVED", reviewedById: manager.id, reviewedAt: daysAgo(5) },
  });
  console.log("  2 demo leave requests created (1 pending, 1 approved)");

  // --- Attendance -------------------------------------------------------
  await db.attendanceLog.create({
    data: { staffId: sales.id, branchId: branch.id, clockInAt: (() => { const d = daysAgo(1); d.setHours(9, 2); return d; })(), clockOutAt: (() => { const d = daysAgo(1); d.setHours(18, 5); return d; })() },
  });
  await db.attendanceLog.create({
    data: { staffId: craftsman.id, branchId: branch.id, clockInAt: (() => { const d = new Date(); d.setHours(8, 55); return d; })() },
  });
  console.log("  2 demo attendance logs created (1 completed shift, 1 currently clocked in)");

  // --- Repairs & Custom Orders -------------------------------------------
  await db.repairOrder.create({
    data: { customerId: cust4.id, branchId: branch.id, type: "REPAIR", description: "Resize ring from size 8 down to size 6.", status: "RECEIVED", estimatedCost: 3500, createdById: sales.id, intakeDate: daysAgo(3) },
  });
  await db.repairOrder.create({
    data: {
      customerId: cust2.id, branchId: branch.id, type: "CUSTOM",
      description: "Design a custom engagement ring using the client's own loose sapphire.",
      status: "IN_PROGRESS", estimatedCost: 45000, assignedToId: craftsman.id, createdById: manager.id,
      relatedInventoryItemId: looseStone.id, intakeDate: daysAgo(8), promisedDate: daysFromNow(6),
    },
  });
  await db.repairOrder.create({
    data: {
      customerId: cust5.id, branchId: branch.id, type: "REPAIR", description: "Clean and re-polish bangle set.",
      status: "COMPLETED", finalCost: 1500, assignedToId: craftsman.id, createdById: sales.id,
      intakeDate: daysAgo(9), completedAt: daysAgo(2),
    },
  });
  console.log("  3 demo repair/custom orders created (RECEIVED, IN_PROGRESS, COMPLETED)");

  // --- Sales Targets -------------------------------------------------
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);
  await db.salesTarget.create({ data: { staffId: sales.id, branchId: branch.id, periodStart: monthStart, periodEnd: monthEnd, targetAmount: 500000 } });
  await db.salesTarget.create({ data: { staffId: manager.id, branchId: branch.id, periodStart: monthStart, periodEnd: monthEnd, targetAmount: 300000 } });
  console.log("  2 demo sales targets created for this month");

  // --- Broker & Memo (mirrors createMemo: decrement stock, CONSIGNMENT at zero) ---
  const broker = await db.broker.create({
    data: { name: "Asanka Ratnayake", company: "Ratnayake Gem Trading", phone: "077 888 9999", branchId: branch.id, createdById: admin.id },
  });
  await db.$transaction(async (tx) => {
    const memo = await tx.brokerMemo.create({
      data: {
        memoNumber: docNumber("MEMO"), brokerId: broker.id, branchId: branch!.id, createdById: admin.id,
        expectedReturnAt: daysFromNow(21), notes: "Taken on consignment for a client viewing in Kandy.",
        items: {
          create: [
            { inventoryItemId: earrings.id, quantity: 1, valueEach: 125000 },
            { inventoryItemId: pendant.id, quantity: 1, valueEach: 140000 },
          ],
        },
      },
    });
    for (const item of [earrings, pendant]) {
      const updated = await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: { decrement: 1 } } });
      if (updated.quantity <= 0) await tx.inventoryItem.update({ where: { id: item.id }, data: { status: "CONSIGNMENT" } });
    }
    return memo;
  });
  console.log("  1 broker + 1 memo created (2 stones on consignment)");

  console.log("\nDone! Demo data added. Log in as any of these to explore different role views:");
  console.log(`  Admin:      admin.demo@example.com / ${DEMO_PASSWORD}`);
  console.log(`  Manager:    manager.demo@example.com / ${DEMO_PASSWORD}`);
  console.log(`  Sales:      sales.demo@example.com / ${DEMO_PASSWORD}`);
  console.log(`  Accountant: accountant.demo@example.com / ${DEMO_PASSWORD}`);
  console.log(`  Craftsman:  craftsman.demo@example.com / ${DEMO_PASSWORD}`);
  console.log("\nThis data is linked across modules (sales reference inventory, memos reference brokers, etc.), so it can't be cleanly removed by just deleting the 5 staff accounts from the UI — ask for a cleanup script when you're ready to clear it out.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
