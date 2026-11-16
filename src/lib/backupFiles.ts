import "server-only";
import { execFile } from "child_process";
import { promisify } from "util";
import { stat, readFile, unlink } from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";

const execFileAsync = promisify(execFile);

/**
 * Tars `public/uploads` (inventory photos, documents) into a temp file and
 * returns its contents — self-hosted VPS deployments only. Vercel
 * deployments store uploads in Vercel Blob instead of local disk (see
 * uploads.ts), so there's nothing on disk to archive there; returns null.
 */
export async function archiveLocalUploads(): Promise<Buffer | null> {
  if (process.env.BLOB_READ_WRITE_TOKEN) return null;

  const uploadRoot = path.join(process.cwd(), "public", "uploads");
  try {
    const info = await stat(uploadRoot);
    if (!info.isDirectory()) return null;
  } catch {
    return null;
  }

  const tmpFile = path.join(os.tmpdir(), `uploads-backup-${crypto.randomUUID()}.tar.gz`);
  try {
    await execFileAsync("tar", ["czf", tmpFile, "-C", path.join(process.cwd(), "public"), "uploads"]);
    const buffer = await readFile(tmpFile);
    return buffer;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}
