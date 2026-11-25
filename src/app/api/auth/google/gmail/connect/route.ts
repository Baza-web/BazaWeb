import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageIntegrations } from "@/lib/rbac";
import { absoluteUrl } from "@/lib/requestOrigin";
import { mailConnectConfigured, buildMailAuthUrl } from "@/lib/googleMail";

export async function GET(request: Request) {
  const session = await requireSessionOrRedirect();
  if (!canManageIntegrations(session.roles)) {
    return NextResponse.redirect(absoluteUrl(request, "/dashboard"));
  }

  if (!mailConnectConfigured()) {
    return NextResponse.redirect(
      absoluteUrl(request, "/settings", { error: "Gmail isn't set up on this server yet. See DEPLOY.md." }),
    );
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("google_gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildMailAuthUrl(state));
}
