import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import { exchangeGoogleCode, verifyGoogleIdToken } from "@/lib/google-auth";
import { resolveOrganizationForLogin } from "@/lib/tenant-resolve";
import { PRODUCT_NAME } from "@/lib/branding";

function redirectToLogin(request: Request, message: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToLogin(request, "Google sign-in failed (invalid request). Please try again.");
  }

  let email: string;
  try {
    const idToken = await exchangeGoogleCode(code);
    ({ email } = await verifyGoogleIdToken(idToken));
  } catch (err) {
    console.error("Google sign-in failed", err);
    return redirectToLogin(request, "Google sign-in failed. Please try again or use your password.");
  }

  const organization = await resolveOrganizationForLogin(email);
  const staff = organization
    ? await db.staff.findFirst({ where: { organizationId: organization.id, email: email.toLowerCase() } })
    : null;
  if (!staff || !staff.active) {
    return redirectToLogin(
      request,
      `No active ${PRODUCT_NAME} account found for that Google account. Ask your admin to add you under Staff.`,
    );
  }

  await createSessionCookie({
    staffId: staff.id,
    organizationId: staff.organizationId,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    branchId: staff.branchId,
  });

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
