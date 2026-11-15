/**
 * A second top-up: makes the demo dataset substantial enough to actually
 * exercise the system — real customer segments in Reports Insights, every
 * brand represented in the Creative Hub, a task and chat message inside the
 * Creative team itself, and real Payroll runs — on top of what
 * `demo-data.ts` and `demo-data-brands-topup.ts` already created.
 *
 * Safe to run once: exits early if a customer named "Lakmali Jayawardena"
 * already exists. Requires both earlier demo scripts to have already run.
 *
 * Run inside the app container:
 *   docker compose exec app node_modules/.bin/tsx prisma/demo-data-expand.ts
 */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const db = new PrismaClient();

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
  const existing = await db.customer.findFirst({ where: { name: "Lakmali Jayawardena" } });
  if (existing) {
    console.log("Expanded demo data already applied (found Lakmali Jayawardena) — skipping. Nothing changed.");
    return;
  }

  const branch = await db.branch.findFirst({ orderBy: { createdAt: "asc" } });
  const admin = await db.staff.findUnique({ where: { email: "admin.demo@example.com" } });
  const manager = await db.staff.findUnique({ where: { email: "manager.demo@example.com" } });
  const sales = await db.staff.findUnique({ where: { email: "sales.demo@example.com" } });
  const craftsman = await db.staff.findUnique({ where: { email: "craftsman.demo@example.com" } });
  const creative = await db.staff.findUnique({ where: { email: "creative.demo@example.com" } });
  const creativeGroup = await db.staffGroup.findFirst({ where: { name: "Creative Team" } });
  if (!branch || !admin || !manager || !sales || !craftsman || !creative || !creativeGroup) {
    throw new Error(
      "Earlier demo data not found. Run `prisma/demo-data.ts` and `prisma/demo-data-brands-topup.ts` first.",
    );
  }

  const brands = await db.brand.findMany({ orderBy: { name: "asc" } });
  const brandByName = (name: string) => brands.find((b) => b.name === name)!;

  // Everything below runs as one transaction: if anything fails partway (e.g. a
  // shared sandbox item turns out to have less stock left than expected), the
  // whole run rolls back instead of leaving partial data that would then make
  // this script's own "already applied" guard lie on the next attempt.
  await db.$transaction(async (tx) => {
    // --- 2 fresh inventory items, so there's enough stock for the extra sales below ---
    const ring2 = await tx.inventoryItem.create({
      data: {
        sku: "DEMO-RG002", name: "Peacock Gold Ring", category: "RING", metalType: "Gold", metalPurity: "22K",
        grossWeightG: 4.5, netWeightG: 4.2, costPrice: 38000, sellingPrice: 58000, quantity: 8, lowStockAt: 1, branchId: branch.id,
        brandId: brandByName("Baza Boutique")?.id,
      },
    });
    const earrings2 = await tx.inventoryItem.create({
      data: {
        sku: "DEMO-ER002", name: "Pearl Drop Earrings", category: "EARRING", metalType: "Gold", metalPurity: "18K",
        gemstoneType: "Freshwater Pearl", costPrice: 22000, sellingPrice: 34000, quantity: 8, lowStockAt: 1, branchId: branch.id,
        brandId: brandByName("Gem Boutique")?.id,
      },
    });

    // The old demo items that still have stock left over from demo-data.ts's sales.
    const ring1 = await tx.inventoryItem.findUniqueOrThrow({ where: { sku: "DEMO-RG001" } });
    const bracelet1 = await tx.inventoryItem.findUniqueOrThrow({ where: { sku: "DEMO-BR001" } });
    const bangle1 = await tx.inventoryItem.findUniqueOrThrow({ where: { sku: "DEMO-BG001" } });
    console.log("  2 fresh inventory items created (enough stock for the sales below)");

    // --- Sale recorder (same pattern as demo-data.ts) ------------------------
    async function recordSale(opts: {
      item: { id: string; sku?: string; sellingPrice: number }; customerId: string; staffId: string; createdAt: Date; brandId?: string;
    }) {
      const total = round2(opts.item.sellingPrice);
      const invoiceNumber = docNumber("INV");
      // Guard against overselling — a sandbox that's been used for other manual testing
      // can have less stock left on a shared item than this script expects.
      const { count } = await tx.inventoryItem.updateMany({
        where: { id: opts.item.id, quantity: { gt: 0 } },
        data: { quantity: { decrement: 1 } },
      });
      if (count === 0) {
        throw new Error(`No stock left on ${opts.item.sku ?? opts.item.id} to record this demo sale.`);
      }
      const createdSale = await tx.sale.create({
        data: {
          invoiceNumber, customerId: opts.customerId, branchId: branch!.id, staffId: opts.staffId, brandId: opts.brandId,
          subtotal: total, discount: 0, tax: 0, total, amountPaid: total, paymentStatus: "PAID",
          paymentMethod: "CASH", createdAt: opts.createdAt,
          items: { create: [{ inventoryItemId: opts.item.id, quantity: 1, priceEach: opts.item.sellingPrice }] },
        },
      });
      const updatedItem = await tx.inventoryItem.findUniqueOrThrow({ where: { id: opts.item.id } });
      if (updatedItem.quantity <= 0) await tx.inventoryItem.update({ where: { id: opts.item.id }, data: { status: "SOLD" } });
      await tx.ledgerEntry.create({
        data: { branchId: branch!.id, type: "INCOME", amount: total, description: `Sale ${invoiceNumber}`, saleId: createdSale.id, date: opts.createdAt },
      });
    }

    // --- Customers with crafted purchase histories, to populate every RFM segment ---
    const bazaBrand = brandByName("Baza Boutique");
    const silverBrand = brandByName("Silver Boutique");
    const gemBrand = brandByName("Gem Boutique");

    const champion1 = await tx.customer.create({ data: { name: "Lakmali Jayawardena", phone: "077 111 2222", email: "lakmali.demo@example.com", branchId: branch.id } });
    await recordSale({ item: ring1, customerId: champion1.id, staffId: sales.id, createdAt: daysAgo(5), brandId: bazaBrand.id });
    await recordSale({ item: ring2, customerId: champion1.id, staffId: sales.id, createdAt: daysAgo(25), brandId: bazaBrand.id });
    await recordSale({ item: ring2, customerId: champion1.id, staffId: sales.id, createdAt: daysAgo(60), brandId: bazaBrand.id });

    const champion2 = await tx.customer.create({ data: { name: "Nuwan Dissanayake", phone: "071 222 3333", branchId: branch.id } });
    await recordSale({ item: bracelet1, customerId: champion2.id, staffId: manager.id, createdAt: daysAgo(10), brandId: silverBrand.id });
    await recordSale({ item: ring2, customerId: champion2.id, staffId: manager.id, createdAt: daysAgo(40), brandId: silverBrand.id });
    await recordSale({ item: earrings2, customerId: champion2.id, staffId: manager.id, createdAt: daysAgo(80) });

    const atRisk1 = await tx.customer.create({ data: { name: "Chamika Fernando", phone: "076 333 4444", branchId: branch.id } });
    await recordSale({ item: ring2, customerId: atRisk1.id, staffId: sales.id, createdAt: daysAgo(120), brandId: gemBrand.id });
    await recordSale({ item: earrings2, customerId: atRisk1.id, staffId: sales.id, createdAt: daysAgo(200), brandId: gemBrand.id });

    const atRisk2 = await tx.customer.create({ data: { name: "Ishara Weerasinghe", phone: "070 444 5555", branchId: branch.id } });
    await recordSale({ item: bangle1, customerId: atRisk2.id, staffId: sales.id, createdAt: daysAgo(150) });
    await recordSale({ item: earrings2, customerId: atRisk2.id, staffId: sales.id, createdAt: daysAgo(300) });

    const lost1 = await tx.customer.create({ data: { name: "Mahesh Gunaratne", phone: "075 555 6666", branchId: branch.id } });
    await recordSale({ item: ring2, customerId: lost1.id, staffId: manager.id, createdAt: daysAgo(400) });
    await recordSale({ item: earrings2, customerId: lost1.id, staffId: manager.id, createdAt: daysAgo(450) });

    const new1 = await tx.customer.create({ data: { name: "Sanduni Karunaratne", phone: "078 666 7777", branchId: branch.id } });
    await recordSale({ item: earrings2, customerId: new1.id, staffId: sales.id, createdAt: daysAgo(10), brandId: bazaBrand.id });

    const new2 = await tx.customer.create({ data: { name: "Dulanga Silva", phone: "072 777 8888", branchId: branch.id } });
    await recordSale({ item: ring1, customerId: new2.id, staffId: sales.id, createdAt: daysAgo(30), brandId: bazaBrand.id });

    console.log("  7 demo customers + 14 sales created (2 Champions, 2 At-risk, 1 Lost, 2 New — populates Reports > Deep insights)");

    // --- Content calendar posts for the remaining brands ---------------------
    const remainingBrandNames = ["Maison Dor", "NBK Bangkok", "Madman Theory", "PHV"];
    const statuses: Array<"IDEA" | "DRAFTING" | "READY" | "SCHEDULED"> = ["IDEA", "DRAFTING", "READY", "SCHEDULED"];
    for (const [i, name] of remainingBrandNames.entries()) {
      const brand = brandByName(name);
      await tx.socialPost.create({
        data: {
          groupId: creativeGroup.id, brandId: brand.id, platform: "INSTAGRAM", title: `${name} — season highlight`,
          caption: `Discover what makes ${name} special.`, status: statuses[i],
          scheduledAt: statuses[i] === "IDEA" ? undefined : daysFromNow(i + 1),
          assignedToId: creative.id, createdById: creative.id,
        },
      });
    }
    // Gem Boutique already has staff assigned but no post yet — add one.
    await tx.socialPost.create({
      data: {
        groupId: creativeGroup.id, brandId: gemBrand.id, platform: "INSTAGRAM", title: "Gem Boutique — loose stones spotlight",
        caption: "Certified Ceylon gemstones, ethically sourced.", status: "DRAFTING",
        assignedToId: creative.id, createdById: creative.id,
      },
    });
    console.log("  5 more content calendar posts created — every one of the 7 brands now has at least one");

    // --- A task and a chat message inside the Creative team itself -----------
    await tx.task.create({
      data: {
        title: "Shoot product photos for the Maison Dor launch", type: "SPECIAL", status: "IN_PROGRESS",
        priority: "HIGH", dueDate: daysFromNow(5), branchId: branch.id, assignedToId: creative.id, assignedById: manager.id,
        groupId: creativeGroup.id,
      },
    });
    await tx.groupMessage.create({ data: { groupId: creativeGroup.id, senderId: manager.id, body: "Can we get the Maison Dor shoot done by Friday?" } });
    await tx.groupMessage.create({ data: { groupId: creativeGroup.id, senderId: creative.id, body: "On it — booking the studio tomorrow morning." } });
    console.log("  1 Creative team task + 2 group chat messages created");

    // --- Real Payroll runs -----------------------------------------------
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    await tx.payrollRun.create({
      data: {
        staffId: creative.id, branchId: branch.id, periodStart: lastMonthStart, periodEnd: lastMonthEnd,
        baseSalary: creative.baseSalary ?? 55000, daysPresent: 22, leaveDaysTaken: 0,
        netPay: round2(creative.baseSalary ?? 55000), createdById: admin.id,
      },
    });

    const netPay = round2((sales.baseSalary ?? 45000) - 1500);
    const expense = await tx.expense.create({
      data: {
        branchId: branch.id, category: "Payroll",
        description: `Payroll — ${sales.name} (${lastMonthStart.toISOString().slice(0, 10)} to ${lastMonthEnd.toISOString().slice(0, 10)})`,
        amount: netPay, date: daysAgo(3), createdById: admin.id,
      },
    });
    await tx.ledgerEntry.create({
      data: { branchId: branch.id, type: "EXPENSE", amount: netPay, description: expense.description, expenseId: expense.id, date: daysAgo(3) },
    });
    await tx.payrollRun.create({
      data: {
        staffId: sales.id, branchId: branch.id, periodStart: lastMonthStart, periodEnd: lastMonthEnd,
        baseSalary: sales.baseSalary ?? 45000, daysPresent: 21, leaveDaysTaken: 1, adjustment: -1500,
        adjustmentNote: "Half-day deduction", netPay, status: "PAID", paidAt: daysAgo(3), expenseId: expense.id, createdById: admin.id,
      },
    });
    console.log("  2 Payroll runs created (1 draft, 1 paid with a matching expense/ledger entry)");
  }, { timeout: 20000 });

  console.log("\nDone! Expanded demo data added — Reports > Deep insights, the Creative Hub, and Payroll now have real content to explore.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
