import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

/** Saves an uploaded File under public/uploads/<subdir>/ and returns its public URL path. */
export async function saveUploadedFile(file: File, subdir: string): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, subdir);
  await mkdir(dir, { recursive: true });

  const ext = path.extname(file.name).toLowerCase() || ".jpg";
  const filename = `${crypto.randomUUID()}${ext}`;
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
