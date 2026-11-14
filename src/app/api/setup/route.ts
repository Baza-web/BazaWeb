import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

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
      "SEED_OWNER_PASSWORD is missing or too short (minimum 10 characters). Set a real password in your deployment's environment variables.",
    );
  }
  if (KNOWN_DEFAULT_PASSWORDS.has(password.toLowerCase())) {
    throw new Error(
      "SEED_OWNER_PASSWORD is a known default/example password. Set a unique password in your deployment's environment variables.",
    );
  }
}

/**
 * One-time setup for deployments with no terminal access (e.g. Vercel):
 * visiting this URL with the right token creates the first branch and
 * Owner account, exactly like prisma/seed.ts does for the Docker/VPS path.
 * Safe to call repeatedly — it does nothing once any staff account exists.
 */
export async function GET(request: Request) {
  const setupToken = process.env.SETUP_TOKEN;
  if (!setupToken) {
    return NextResponse.json({ error: "SETUP_TOKEN is not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("token") !== setupToken) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 403 });
  }

  const existing = await db.staff.findFirst();
  if (existing) {
    return NextResponse.json({ message: "Setup already completed — a staff account already exists." });
  }

  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@example.com";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  const ownerName = process.env.SEED_OWNER_NAME ?? "Business Owner";
  const branchName = process.env.SEED_BRANCH_NAME ?? "Main Branch";

  try {
    assertStrongOwnerPassword(ownerPassword);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const branch = await db.branch.create({ data: { name: branchName } });
  const passwordHash = await hashPassword(ownerPassword);
  await db.staff.create({
    data: {
      name: ownerName,
      email: ownerEmail.toLowerCase(),
      passwordHash,
      role: "OWNER",
      branchId: branch.id,
    },
  });

  return NextResponse.json({
    message: "Setup complete. Sign in and change this password immediately.",
    branch: branchName,
    email: ownerEmail,
  });
}
