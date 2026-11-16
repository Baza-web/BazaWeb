import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { buildGoogleAuthUrl, googleSignInConfigured } from "@/lib/google-auth";
import { absoluteUrl } from "@/lib/requestOrigin";

export async function GET(request: Request) {
  if (!googleSignInConfigured()) {
    return NextResponse.redirect(absoluteUrl(request, "/login", { error: "Google sign-in isn't set up yet." }));
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildGoogleAuthUrl(state));
}
