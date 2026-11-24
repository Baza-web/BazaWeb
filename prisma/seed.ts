import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const KNOWN_DEFAULT_PASSWORDS = new Set([
  "changeme123!",
  "password",
  "password123",
  "owner123",
  "admin123",
  "123456",
]);

function assertStrongOwnerPassword(password: string | undefined): asserts password is string {
  if (!password || password.length < 10) {
    throw new Error(
      "SEED_OWNER_PASSWORD is missing or too short (minimum 10 characters). " +
        "Set a real password in your .env before first boot — see DEPLOY.md.",
    );
  }
  if (KNOWN_DEFAULT_PASSWORDS.has(password.toLowerCase())) {
    throw new Error(
      "SEED_OWNER_PASSWORD is a known default/example password. " +
        "Set a unique password in your .env before first boot — see DEPLOY.md.",
    );
  }
}

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@example.com";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  const ownerName = process.env.SEED_OWNER_NAME ?? "Business Owner";
  const branchName = process.env.SEED_BRANCH_NAME ?? "Main Branch";

  // Skip if ANY staff account already exists — not just one matching SEED_OWNER_EMAIL exactly.
  // This runs on every container (re)build, and the placeholder email it's keyed on is meant to
  // be changed after first login (see DEPLOY.md); once it no longer matches any real account
  // (renamed, or removed as demo data), an email-only check would re-seed a brand-new branch +
  // owner account on every single redeploy instead of recognizing the app is already set up.
  const anyStaffExists = (await db.staff.count()) > 0;
  if (anyStaffExists) {
    console.log("Staff accounts already exist — skipping first-boot seed.");
    return;
  }

  assertStrongOwnerPassword(ownerPassword);

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
  console.log(`  Branch: ${branchName}`);
  console.log(`  Email:  ${ownerEmail}`);
  console.log("Sign in with the password you set in SEED_OWNER_PASSWORD, then create accounts for your team under Staff.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
