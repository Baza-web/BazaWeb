import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageIntegrations } from "@/lib/rbac";
import { absoluteUrl } from "@/lib/requestOrigin";
import {
  exchangeDriveCode,
  emailFromIdToken,
  findOrCreateBackupFolder,
  saveConnection,
} from "@/lib/googleDrive";

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
  const expectedState = cookieStore.get("google_drive_oauth_state")?.value;
  cookieStore.delete("google_drive_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToSettings(request, { error: "Google Drive connection failed (invalid request). Please try again." });
  }

  try {
    const tokens = await exchangeDriveCode(code);
    if (!tokens.refresh_token) {
      return redirectToSettings(request, {
        error:
          "Google didn't give us a reusable connection this time — if you've connected this Google account to this app before, remove its access at myaccount.google.com/permissions first, then try again.",
      });
    }
    const googleEmail = tokens.id_token ? emailFromIdToken(tokens.id_token) : "connected Google account";
    const folderId = await findOrCreateBackupFolder(tokens.access_token);
    await saveConnection(tokens.refresh_token, googleEmail, folderId, session.staffId);
  } catch (err) {
    console.error("Google Drive connect failed", err);
    return redirectToSettings(request, { error: "Google Drive connection failed. Please try again." });
  }

  return redirectToSettings(request, { success: "Google Drive connected." });
}
