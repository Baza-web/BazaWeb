"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createSessionCookie, verifyPassword } from "@/lib/auth";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// A single-instance, in-memory limiter against password-spray from one
// source across many accounts. Per-account lockout below is the durable
// defense; this resets on restart and doesn't span multiple app instances,
// which is fine for this self-hosted single-container deployment.
const MAX_ATTEMPTS_PER_IP = 20;
const IP_WINDOW_MS = 15 * 60 * 1000;
const attemptsByIp = new Map<string, number[]>();

function isIpRateLimited(ip: string) {
  const now = Date.now();
  const attempts = (attemptsByIp.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  attempts.push(now);
  attemptsByIp.set(ip, attempts);
  return attempts.length > MAX_ATTEMPTS_PER_IP;
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function login(formData: FormData) {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/login?error=" + encodeURIComponent("Enter a valid email and password."));
  }

  const ip = await clientIp();
  if (isIpRateLimited(ip)) {
    redirect("/login?error=" + encodeURIComponent("Too many login attempts from your network. Please wait a few minutes and try again."));
  }

  const staff = await db.staff.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!staff || !staff.active) {
    redirect("/login?error=" + encodeURIComponent("No active account found with that email."));
  }

  if (staff.lockedUntil && staff.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((staff.lockedUntil.getTime() - Date.now()) / 60000);
    redirect(
      "/login?error=" +
        encodeURIComponent(`Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`),
    );
  }

  const valid = await verifyPassword(parsed.data.password, staff.passwordHash);
  if (!valid) {
    const failedLoginAttempts = staff.failedLoginAttempts + 1;
    const lockedUntil =
      failedLoginAttempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
    await db.staff.update({
      where: { id: staff.id },
      data: {
        failedLoginAttempts: lockedUntil ? 0 : failedLoginAttempts,
        lockedUntil,
      },
    });
    redirect("/login?error=" + encodeURIComponent("Incorrect password."));
  }

  if (staff.failedLoginAttempts > 0 || staff.lockedUntil) {
    await db.staff.update({
      where: { id: staff.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  await createSessionCookie({
    staffId: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    branchId: staff.branchId,
  });

  redirect("/dashboard");
}
