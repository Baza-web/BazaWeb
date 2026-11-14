import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

function useBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Identifies a file's real type from its content (magic bytes), never from
 * the filename extension or browser-supplied MIME type — both are fully
 * attacker-controlled. A file we can't positively identify as one of these
 * known-safe formats is rejected outright: in particular, we never write an
 * uploaded file out with an extension (.html, .svg, .js, …) that a browser
 * would treat as active content when served from our own origin.
 */
function detectFileKind(buffer: Buffer): { ext: string; kind: "image" | "pdf" } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: ".jpg", kind: "image" };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: ".png", kind: "image" };
  }
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "GIF87a") return { ext: ".gif", kind: "image" };
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "GIF89a") return { ext: ".gif", kind: "image" };
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { ext: ".webp", kind: "image" };
  }
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
    return { ext: ".pdf", kind: "pdf" };
  }
  return null;
}

/**
 * Saves an uploaded file and returns its public URL. Uses Vercel Blob when
 * BLOB_READ_WRITE_TOKEN is set (Vercel deployments, which have no writable
 * local disk), otherwise writes to public/uploads/<subdir>/ on local disk
 * (self-hosted VPS deployments, where that folder is a mounted volume and
 * served directly by Nginx — see docker-compose.yml / nginx/*.conf).
 *
 * Rejects anything that doesn't sniff as a real image (or, when
 * `allowPdf` is set, a real PDF) — the extension is always derived from the
 * detected content, never from the uploader-supplied filename.
 */
export async function saveUploadedFile(file: File, subdir: string, allowPdf = false): Promise<string | null> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectFileKind(buffer);
  if (!detected || (detected.kind === "pdf" && !allowPdf)) return null;

  const filename = `${crypto.randomUUID()}${detected.ext}`;

  if (useBlobStorage()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${subdir}/${filename}`, buffer, { access: "public" });
    return blob.url;
  }

  const dir = path.join(UPLOAD_ROOT, subdir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/${subdir}/${filename}`;
}

export async function saveUploadedImages(files: File[], subdir: string, allowPdf = false): Promise<string[]> {
  const valid = files.filter((f) => f && f.size > 0);
  const results: string[] = [];
  for (const file of valid) {
    const url = await saveUploadedFile(file, subdir, allowPdf);
    if (url) results.push(url);
  }
  return results;
}
