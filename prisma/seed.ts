import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@example.com";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
  const ownerName = process.env.SEED_OWNER_NAME ?? "Business Owner";
  const branchName = process.env.SEED_BRANCH_NAME ?? "Main Branch";

  const existingOwner = await db.staff.findUnique({ where: { email: ownerEmail.toLowerCase() } });
  if (existingOwner) {
    console.log(`Owner account already exists for ${ownerEmail}, skipping seed.`);
    return;
  }

  const branch = await db.branch.create({ data: { name: branchName } });

  const passwordHash = await bcrypt.hash(ownerPassword, 12);
  await db.staff.create({
    data: {
      name: ownerName,
      email: ownerEmail.toLowerCase(),
      passwordHash,
      role: "OWNER",
      branchId: branch.id,
    },
  });

  console.log("Seeded first branch and owner account:");
  console.log(`  Branch:   ${branchName}`);
  console.log(`  Email:    ${ownerEmail}`);
  console.log(`  Password: ${ownerPassword}`);
  console.log("Sign in and change this password immediately, then create accounts for your team under Staff.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
