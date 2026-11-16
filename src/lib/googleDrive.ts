import "server-only";
import { db } from "./db";
import { decryptToken, encryptToken } from "./tokenCrypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const BACKUP_FOLDER_NAME = "26. Claude Ai";

export function driveConnectConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REDIRECT_URI,
  );
}

export function buildDriveAuthUrl(state: string) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_DRIVE_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", `${DRIVE_SCOPE} openid email`);
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

export async function exchangeDriveCode(code: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_DRIVE_REDIRECT_URI!,
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

export async function getDriveConnection() {
  return db.googleDriveConnection.findUnique({ where: { id: "singleton" }, include: { connectedBy: true } });
}

/** Returns a fresh access token for Drive API calls, or null if nothing is connected. */
export async function getValidAccessToken(): Promise<string | null> {
  const connection = await getDriveConnection();
  if (!connection) return null;
  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  return refreshAccessToken(refreshToken);
}

async function driveFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive API ${path} failed: ${res.status} ${await res.text()}`);
  return res;
}

export async function findOrCreateBackupFolder(accessToken: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const listRes = await driveFetch(accessToken, `files?q=${q}&fields=files(id,name)`);
  const { files } = (await listRes.json()) as { files: { id: string; name: string }[] };
  if (files.length > 0) return files[0].id;

  const createRes = await driveFetch(accessToken, "files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

/** Uploads (or overwrites, if a file with the same name already exists in the folder) a file into the backup folder. */
export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  filename: string,
  content: Buffer,
  mimeType: string,
) {
  const q = encodeURIComponent(`name='${filename}' and '${folderId}' in parents and trashed=false`);
  const listRes = await driveFetch(accessToken, `files?q=${q}&fields=files(id)`);
  const { files } = (await listRes.json()) as { files: { id: string }[] };

  const boundary = "baza-boutique-backup-boundary";
  const metadata = files.length > 0 ? {} : { name: filename, parents: [folderId] };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const multipartBody = Buffer.concat([Buffer.from(body, "utf8"), content, Buffer.from(`\r\n--${boundary}--`, "utf8")]);

  const uploadUrl =
    files.length > 0
      ? `https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const res = await fetch(uploadUrl, {
    method: files.length > 0 ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(multipartBody),
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function saveConnection(refreshToken: string, googleEmail: string, driveFolderId: string, staffId: string) {
  await db.googleDriveConnection.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      encryptedRefreshToken: encryptToken(refreshToken),
      googleEmail,
      driveFolderId,
      connectedByStaffId: staffId,
    },
    update: {
      encryptedRefreshToken: encryptToken(refreshToken),
      googleEmail,
      driveFolderId,
      connectedByStaffId: staffId,
    },
  });
}

export async function disconnectDrive() {
  const connection = await getDriveConnection();
  if (!connection) return;
  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }).catch(
    () => {},
  );
  await db.googleDriveConnection.delete({ where: { id: "singleton" } });
}
