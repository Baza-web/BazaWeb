import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

function useBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Saves an uploaded file and returns its public URL. Uses Vercel Blob when
 * BLOB_READ_WRITE_TOKEN is set (Vercel deployments, which have no writable
 * local disk), otherwise writes to public/uploads/<subdir>/ on local disk
 * (self-hosted VPS deployments, where that folder is a mounted volume).
 */
export async function saveUploadedFile(file: File, subdir: string): Promise<string> {
  const ext = path.extname(file.name).toLowerCase() || ".jpg";
  const filename = `${crypto.randomUUID()}${ext}`;

  if (useBlobStorage()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${subdir}/${filename}`, file, { access: "public" });
    return blob.url;
  }

  const dir = path.join(UPLOAD_ROOT, subdir);
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/${subdir}/${filename}`;
}

export async function saveUploadedImages(files: File[], subdir: string): Promise<string[]> {
  const valid = files.filter((f) => f && f.size > 0);
  const results: string[] = [];
  for (const file of valid) {
    results.push(await saveUploadedFile(file, subdir));
  }
  return results;
}
