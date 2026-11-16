import "server-only";
import { db } from "./db";
import { decryptToken, encryptToken } from "./tokenCrypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
// send-only — this app never reads the connected mailbox.
const MAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export function mailConnectConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_GMAIL_REDIRECT_URI,
  );
}

export function buildMailAuthUrl(state: string) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_GMAIL_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", `${MAIL_SCOPE} openid email`);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
};

export async function exchangeMailCode(code: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_GMAIL_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  const data: TokenResponse = await res.json();
  return data.access_token;
}

/** Decodes the email out of a Google id_token without verifying signature — only used right after our own exchange with Google, for display purposes. */
export function emailFromIdToken(idToken: string): string {
  const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
  return String(payload.email ?? "unknown");
}

export async function getMailConnection() {
  return db.googleMailConnection.findUnique({ where: { id: "singleton" }, include: { connectedBy: true } });
}

/** Returns a fresh access token for Gmail API calls, or null if nothing is connected. */
export async function getValidMailAccessToken(): Promise<string | null> {
  const connection = await getMailConnection();
  if (!connection) return null;
  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  return refreshAccessToken(refreshToken);
}

export async function saveMailConnection(refreshToken: string, googleEmail: string, staffId: string) {
  await db.googleMailConnection.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", encryptedRefreshToken: encryptToken(refreshToken), googleEmail, connectedByStaffId: staffId },
    update: { encryptedRefreshToken: encryptToken(refreshToken), googleEmail, connectedByStaffId: staffId },
  });
}

export async function disconnectMail() {
  const connection = await getMailConnection();
  if (!connection) return;
  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }).catch(
    () => {},
  );
  await db.googleMailConnection.delete({ where: { id: "singleton" } });
}

function encodeHeaderValue(value: string) {
  // Encodes a non-ASCII display name (e.g. "Baza Boutique") per RFC 2047 so Gmail renders it correctly rather than garbling it.
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Sends a plain-text email from the connected Gmail account. Returns the Gmail message id. */
export async function sendMail(accessToken: string, fromEmail: string, fromName: string, to: string, subject: string, body: string) {
  const mime =
    `From: ${encodeHeaderValue(fromName)} <${fromEmail}>\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${encodeHeaderValue(subject)}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
    body;
  const raw = Buffer.from(mime, "utf8").toString("base64url");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}
