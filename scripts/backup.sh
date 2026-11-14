#!/bin/bash
# Baza ERP nightly backup.
#
# Dumps the Postgres database and archives uploaded photos, keeping the
# last BACKUP_RETENTION_DAYS days of backups and deleting anything older.
# Run this from the project directory (where docker-compose.yml lives),
# or set PROJECT_DIR. Intended to run via cron — see DEPLOY.md.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/baza-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DATE="$(date +%F)"

cd "$PROJECT_DIR"
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup in $BACKUP_DIR..."

DB_FILE="$BACKUP_DIR/db-$DATE.sql.gz"
UPLOADS_FILE="$BACKUP_DIR/uploads-$DATE.tar.gz"

docker compose exec -T db pg_dump -U baza baza | gzip > "$DB_FILE"
if [ ! -s "$DB_FILE" ]; then
  echo "[$(date)] ERROR: database dump is empty, aborting." >&2
  rm -f "$DB_FILE"
  exit 1
fi

# Tar the uploads volume from inside the already-running app container
# (it already mounts the volume at /app/public/uploads) — avoids needing
# to know the raw Docker volume name.
docker compose exec -T app tar czf - -C /app/public uploads > "$UPLOADS_FILE"

echo "[$(date)] Wrote $DB_FILE and $UPLOADS_FILE"

# Rotate: delete backups older than RETENTION_DAYS.
find "$BACKUP_DIR" -name "db-*.sql.gz" -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "uploads-*.tar.gz" -mtime "+$RETENTION_DAYS" -delete

echo "[$(date)] Backup complete. Kept: $(find "$BACKUP_DIR" -name 'db-*.sql.gz' | wc -l) daily database backups."

# --- Optional offsite copy ---
# Uncomment one of these once you've set up a destination, so a VPS
# failure doesn't take your only copy of the backups with it.
#
# Via rclone (e.g. to Backblaze B2, after `rclone config`):
#   rclone copy "$DB_FILE" remote:baza-backups/
#   rclone copy "$UPLOADS_FILE" remote:baza-backups/
#
# Via SSH to another server you control (needs a passwordless SSH key set up):
#   scp "$DB_FILE" "$UPLOADS_FILE" user@other-server:/path/to/backups/
