import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageIntegrations } from "@/lib/rbac";
import { absoluteUrl } from "@/lib/requestOrigin";
import { exchangeMailCode, emailFromIdToken, saveMailConnection } from "@/lib/googleMail";

function redirectToSettings(request: Request, params: Record<string, string>) {
  return NextResponse.redirect(absoluteUrl(request, "/settings", params));
}

export async function GET(request: Request) {
  const session = await requireSessionOrRedirect();
  if (!canManageIntegrations(session.roles)) {
    return NextResponse.redirect(absoluteUrl(request, "/dashboard"));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_gmail_oauth_state")?.value;
  cookieStore.delete("google_gmail_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToSettings(request, { error: "Gmail connection failed (invalid request). Please try again." });
  }

  try {
    const tokens = await exchangeMailCode(code);
    if (!tokens.refresh_token) {
      return redirectToSettings(request, {
        error:
          "Google didn't give us a reusable connection this time — if you've connected this Google account to this app before, remove its access at myaccount.google.com/permissions first, then try again.",
      });
    }
    const googleEmail = tokens.id_token ? emailFromIdToken(tokens.id_token) : "connected Google account";
    await saveMailConnection(tokens.refresh_token, googleEmail, session.staffId);
  } catch (err) {
    console.error("Gmail connect failed", err);
    return redirectToSettings(request, { error: "Gmail connection failed. Please try again." });
  }

  return redirectToSettings(request, { success: "Gmail connected." });
}
