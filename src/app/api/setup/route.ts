import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

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
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
  const ownerName = process.env.SEED_OWNER_NAME ?? "Business Owner";
  const branchName = process.env.SEED_BRANCH_NAME ?? "Main Branch";

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
