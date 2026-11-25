import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import type { Role } from "@prisma/client";

const COOKIE_NAME = "baza_session";
const SESSION_DAYS = 14;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  staffId: string;
  name: string;
  email: string;
  /** Primary role — drives dashboard home and "Manager/Sales/etc." badges. */
  role: Role;
  /** Primary + additionalRoles, deduped. Permission checks should use this (the union), not `role` alone. */
  roles: Role[];
  branchId: string | null;
};

function effectiveRoles(staff: { role: Role; additionalRoles: Role[] }): Role[] {
  return Array.from(new Set([staff.role, ...staff.additionalRoles]));
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    const role = payload.role as Role;
    return {
      staffId: payload.staffId as string,
      name: payload.name as string,
      email: payload.email as string,
      role,
      roles: (payload.roles as Role[] | undefined) ?? [role],
      branchId: (payload.branchId as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** For API routes: throws instead of redirecting so the caller can return 401. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }
  // Guard against a stale session referencing a deactivated/deleted account.
  const staff = await db.staff.findUnique({ where: { id: session.staffId } });
  if (!staff || !staff.active) {
    throw new Error("UNAUTHENTICATED");
  }
  // Refresh role/roles/branch from the row we already fetched, so a role grant or branch
  // move takes effect immediately instead of waiting for the next login.
  return { ...session, role: staff.role, roles: effectiveRoles(staff), branchId: staff.branchId };
}

/** For pages/layouts: redirects to /login instead of throwing. */
export async function requireSessionOrRedirect(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const staff = await db.staff.findUnique({ where: { id: session.staffId } });
  if (!staff || !staff.active) {
    redirect("/login");
  }
  return { ...session, role: staff.role, roles: effectiveRoles(staff), branchId: staff.branchId };
}
