/**
 * One-off top-up for a system where `prisma/demo-data.ts` already ran
 * using an older version of itself — before Brands, the Creative Hub, and
 * HRM leave/onboarding existed. Adds just the pieces that script would
 * have created for those modules, onto the demo staff that are already
 * there, without touching or duplicating anything the original run made.
 *
 * Safe to run once: exits early if `creative.demo@example.com` already
 * exists. Requires `prisma/demo-data.ts` to have already been run (needs
 * the 5 original demo staff and branch to exist).
 *
 * Run inside the app container:
 *   docker compose exec app node_modules/.bin/tsx prisma/demo-data-brands-topup.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEMO_PASSWORD = "Demo@12345";

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
  const existing = await db.staff.findUnique({ where: { email: "creative.demo@example.com" } });
  if (existing) {
    console.log("Top-up already applied (found creative.demo@example.com) — skipping. Nothing changed.");
    return;
  }

  const branch = await db.branch.findFirst({ orderBy: { createdAt: "asc" } });
  const admin = await db.staff.findUnique({ where: { email: "admin.demo@example.com" } });
  const manager = await db.staff.findUnique({ where: { email: "manager.demo@example.com" } });
  const sales = await db.staff.findUnique({ where: { email: "sales.demo@example.com" } });
  const accountant = await db.staff.findUnique({ where: { email: "accountant.demo@example.com" } });
  const craftsman = await db.staff.findUnique({ where: { email: "craftsman.demo@example.com" } });
  if (!branch || !admin || !manager || !sales || !accountant || !craftsman) {
    throw new Error(
      "Original demo staff not found. Run `prisma/demo-data.ts` first — this top-up only adds to data it already created.",
    );
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // One transaction: if anything fails partway, the whole run rolls back instead
  // of leaving the Creative staff account created (which would make this script's
  // own "already applied" guard lie on the next attempt) with the rest missing.
  await db.$transaction(async (tx) => {
    const creative = await tx.staff.create({
      data: {
        name: "Tharindu Jayasuriya", email: "creative.demo@example.com", passwordHash, role: "CREATIVE", branchId: branch.id,
        baseSalary: 55000, bankName: "Commercial Bank", bankAccountNumber: "8012345678", bankBranch: "Colombo 03",
      },
    });
    await tx.staff.update({ where: { id: sales.id }, data: { baseSalary: 45000, bankName: "Sampath Bank", bankAccountNumber: "0045671234", bankBranch: "Nugegoda" } });
    await tx.staff.update({ where: { id: craftsman.id }, data: { baseSalary: 40000, bankName: "BOC", bankAccountNumber: "0078452233", bankBranch: "Pettah" } });
    console.log("  1 demo Creative staff created + bank/salary details added to Sales and Craftsman");

    // --- Brands + staff assignments (some staff work for 2 brands) ---------
    const brands = await tx.brand.findMany({ orderBy: { name: "asc" } });
    const brandByName = (name: string) => brands.find((b) => b.name === name);
    const bazaBrand = brandByName("Baza Boutique");
    const silverBrand = brandByName("Silver Boutique");
    const gemBrand = brandByName("Gem Boutique");
    if (bazaBrand) {
      await tx.staff.update({ where: { id: admin.id }, data: { brands: { connect: [{ id: bazaBrand.id }] } } });
      await tx.staff.update({ where: { id: sales.id }, data: { brands: { connect: [{ id: bazaBrand.id }] } } });
      await tx.staff.update({ where: { id: accountant.id }, data: { brands: { connect: [{ id: bazaBrand.id }] } } });
      await tx.staff.update({ where: { id: craftsman.id }, data: { brands: { connect: [{ id: bazaBrand.id }] } } });
      if (silverBrand) {
        await tx.staff.update({ where: { id: manager.id }, data: { brands: { connect: [{ id: bazaBrand.id }, { id: silverBrand.id }] } } });
      }
      if (gemBrand) {
        await tx.staff.update({ where: { id: creative.id }, data: { brands: { connect: [{ id: bazaBrand.id }, { id: gemBrand.id }] } } });
      }
      console.log("  Demo staff assigned to brands (Manager and Creative each work across 2 brands)");
    }

    // --- Creative Team + content calendar -----------------------------------
    const creativeGroup = await tx.staffGroup.create({
      data: {
        name: "Creative Team", branchId: branch.id, isCreativeTeam: true,
        members: { connect: [{ id: creative.id }, { id: manager.id }] },
      },
    });

    if (bazaBrand) {
      await tx.socialPost.create({
        data: {
          groupId: creativeGroup.id, brandId: bazaBrand.id, platform: "INSTAGRAM", title: "New arrivals teaser",
          caption: "✨ New arrivals landing this week at Baza Boutique — stay tuned!", status: "IDEA",
          assignedToId: creative.id, createdById: creative.id,
        },
      });
      await tx.socialPost.create({
        data: {
          groupId: creativeGroup.id, brandId: bazaBrand.id, platform: "INSTAGRAM", title: "Lotus ring close-up reel",
          caption: "The Kandyan Lotus Ring, up close. #BazaBoutique #CeylonGold", status: "DRAFTING",
          scheduledAt: daysFromNow(2), assignedToId: creative.id, createdById: creative.id,
        },
      });
      await tx.socialPost.create({
        data: {
          groupId: creativeGroup.id, brandId: bazaBrand.id, platform: "INSTAGRAM", title: "Festive season promo",
          caption: "Light up the season with Baza Boutique gold. Visit us in-store today.", status: "READY",
          scheduledAt: daysFromNow(4), assignedToId: creative.id, createdById: manager.id,
        },
      });
      await tx.socialPost.create({
        data: {
          groupId: creativeGroup.id, brandId: bazaBrand.id, platform: "INSTAGRAM", title: "Weekend showroom hours",
          caption: "We're open this weekend 10am–7pm. Come say hello!", status: "SCHEDULED",
          scheduledAt: daysFromNow(1), assignedToId: creative.id, createdById: creative.id,
          autoPublish: true, approvedById: admin.id, approvedAt: daysAgo(0),
        },
      });
      await tx.socialPost.create({
        data: {
          groupId: creativeGroup.id, brandId: bazaBrand.id, platform: "INSTAGRAM", title: "Throwback: Temple necklace",
          caption: "One of our finest handcrafted pieces — sold, but the craftsmanship lives on. 💛", status: "POSTED",
          scheduledAt: daysAgo(5), postedAt: daysAgo(5), assignedToId: creative.id, createdById: creative.id,
        },
      });
      if (silverBrand) {
        await tx.socialPost.create({
          data: {
            groupId: creativeGroup.id, brandId: silverBrand.id, platform: "FACEBOOK", title: "Silver Boutique launch post",
            caption: "Introducing Silver Boutique — timeless silver jewellery for every day.", status: "SCHEDULED",
            scheduledAt: daysFromNow(3), assignedToId: creative.id, createdById: creative.id,
            autoPublish: true,
          },
        });
      }
    }
    console.log("  1 Creative Team group + 6 content calendar posts created (every status, 2 brands, 1 pending Instagram approval)");

    // --- Leave entitlements + onboarding checklist, for every demo staff ---
    const currentYear = new Date().getFullYear();
    const demoStaff = [admin, manager, sales, accountant, craftsman, creative];
    const ONBOARDING_LABELS = [
      "Collect ID/NIC copy",
      "Collect bank details for payroll",
      "Issue uniform / ID badge",
      "Walk through POS, attendance clock-in, and the app",
      "Add to the relevant Staff Group",
    ];
    for (const [i, s] of demoStaff.entries()) {
      await tx.leaveEntitlement.createMany({
        data: [
          { staffId: s.id, type: "VACATION", year: currentYear, daysAllotted: 14 },
          { staffId: s.id, type: "SICK", year: currentYear, daysAllotted: 7 },
          { staffId: s.id, type: "PERSONAL", year: currentYear, daysAllotted: 3 },
        ],
        skipDuplicates: true,
      });
      const doneCount = Math.min(i + 1, ONBOARDING_LABELS.length);
      const hasOnboarding = await tx.onboardingTask.findFirst({ where: { staffId: s.id } });
      if (!hasOnboarding) {
        await tx.onboardingTask.createMany({
          data: ONBOARDING_LABELS.map((label, idx) => ({
            staffId: s.id, label, completed: idx < doneCount, completedAt: idx < doneCount ? daysAgo(20 - idx) : null,
          })),
        });
      }
    }
    console.log("  Leave entitlements + onboarding checklists created for all 6 demo staff");

    // --- Accounting budgets --------------------------------------------
    await tx.budget.createMany({
      data: [
        { branchId: branch.id, category: "Rent", monthlyLimit: 90000 },
        { branchId: branch.id, category: "Utilities", monthlyLimit: 15000 },
        { branchId: branch.id, category: "Marketing", monthlyLimit: 20000 },
      ],
      skipDuplicates: true,
    });
    console.log("  3 demo budgets created (Rent, Utilities, Marketing)");

    // --- Tag a few of the original sales/expenses with a brand -------------
    if (bazaBrand) {
      const ringSale = await tx.sale.findFirst({ where: { items: { some: { inventoryItem: { sku: "DEMO-RG001" } } } } });
      const earringsSale = await tx.sale.findFirst({ where: { items: { some: { inventoryItem: { sku: "DEMO-ER001" } } } } });
      if (ringSale) await tx.sale.update({ where: { id: ringSale.id }, data: { brandId: bazaBrand.id } });
      if (earringsSale) await tx.sale.update({ where: { id: earringsSale.id }, data: { brandId: bazaBrand.id } });
      await tx.expense.updateMany({ where: { category: { in: ["Rent", "Utilities"] }, branchId: branch.id, brandId: null }, data: { brandId: bazaBrand.id } });
      if (silverBrand) {
        const braceletSale = await tx.sale.findFirst({ where: { items: { some: { inventoryItem: { sku: "DEMO-BR001" } } } } });
        if (braceletSale) await tx.sale.update({ where: { id: braceletSale.id }, data: { brandId: silverBrand.id } });
        await tx.expense.updateMany({ where: { category: "Marketing", branchId: branch.id, brandId: null }, data: { brandId: silverBrand.id } });
      }
      console.log("  Tagged a few of the original demo sales/expenses with a brand");
    }
  }, { timeout: 20000 });

  console.log("\nDone! Added the Brands/Creative Hub/HRM top-up.");
  console.log(`  Creative: creative.demo@example.com / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
