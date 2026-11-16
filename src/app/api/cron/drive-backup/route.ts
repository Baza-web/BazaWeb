import { NextResponse } from "next/server";
import { getDriveConnection, getValidAccessToken, uploadFileToDrive, deleteOldBackups } from "@/lib/googleDrive";
import { BACKUP_SHEETS } from "@/lib/backupData";
import { archiveLocalUploads } from "@/lib/backupFiles";
import { timestampedFilename } from "@/lib/xlsxExport";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// Backups are kept forever by default — every day's files stay in the
// "26. Claude Ai" folder permanently. Set DRIVE_BACKUP_RETENTION_DAYS in
// .env only if you'd rather have old backups deleted automatically.
const RETENTION_DAYS = process.env.DRIVE_BACKUP_RETENTION_DAYS
  ? Number(process.env.DRIVE_BACKUP_RETENTION_DAYS)
  : null;

/**
 * Triggered once a day by a cron job on the server (see DEPLOY.md). Exports
 * every core business table to its own dated .xlsx, archives the local
 * uploads folder (self-hosted deployments only), and uploads everything
 * into the connected Google account's "26. Claude Ai" folder. Backups are
 * kept forever unless DRIVE_BACKUP_RETENTION_DAYS is set. A no-op, not an
 * error, if nobody has connected Google Drive yet.
 */
export async function GET(request: Request) {
  const cronToken = process.env.CRON_TOKEN;
  if (!cronToken) {
    return NextResponse.json({ error: "CRON_TOKEN is not configured." }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  if (searchParams.get("token") !== cronToken) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 403 });
  }

  const connection = await getDriveConnection();
  if (!connection || !connection.driveFolderId) {
    return NextResponse.json({ ok: true, skipped: "Google Drive is not connected yet." });
  }

  let accessToken: string;
  try {
    accessToken = (await getValidAccessToken())!;
  } catch (err) {
    console.error("Drive backup: couldn't refresh access token", err);
    return NextResponse.json({ ok: false, error: "Couldn't refresh the Google Drive connection." }, { status: 502 });
  }
  const folderId = connection.driveFolderId;

  const uploaded: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const sheet of BACKUP_SHEETS) {
    try {
      const buffer = await sheet.build();
      const filename = timestampedFilename(`${sheet.name}-backup`);
      await uploadFileToDrive(accessToken, folderId, filename, buffer, XLSX_MIME);
      uploaded.push(filename);
    } catch (err) {
      console.error(`Drive backup: ${sheet.name} failed`, err);
      failed.push({ name: sheet.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  try {
    const uploadsArchive = await archiveLocalUploads();
    if (uploadsArchive) {
      const filename = timestampedFilename("uploads-backup", "tar.gz");
      await uploadFileToDrive(accessToken, folderId, filename, uploadsArchive, "application/gzip");
      uploaded.push(filename);
    }
  } catch (err) {
    console.error("Drive backup: uploads archive failed", err);
    failed.push({ name: "uploads-archive", error: err instanceof Error ? err.message : String(err) });
  }

  let deletedOld = 0;
  if (RETENTION_DAYS !== null) {
    try {
      deletedOld = await deleteOldBackups(accessToken, folderId, RETENTION_DAYS);
    } catch (err) {
      console.error("Drive backup: retention cleanup failed", err);
    }
  }

  return NextResponse.json({ ok: failed.length === 0, uploaded, failed, deletedOld });
}
