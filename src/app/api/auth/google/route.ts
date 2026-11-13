import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { buildGoogleAuthUrl, googleSignInConfigured } from "@/lib/google-auth";

export async function GET(request: Request) {
  if (!googleSignInConfigured()) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "Google sign-in isn't set up yet.");
    return NextResponse.redirect(url);
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
