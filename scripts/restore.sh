#!/bin/bash
# Restore a Baza ERP backup made by backup.sh.
# Usage: ./scripts/restore.sh <db-YYYY-MM-DD.sql.gz> <uploads-YYYY-MM-DD.tar.gz>
#
# WARNING: this overwrites the current database and uploaded photos.
# Run from the project directory (where docker-compose.yml lives).
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <db-backup.sql.gz> <uploads-backup.tar.gz>" >&2
  exit 1
fi

DB_FILE="$1"
UPLOADS_FILE="$2"

read -r -p "This will OVERWRITE the current database and photos. Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "Restoring database from $DB_FILE..."
gunzip -c "$DB_FILE" | docker compose exec -T db psql -U baza -d baza

echo "Restoring uploads from $UPLOADS_FILE..."
docker compose exec -T app sh -c "rm -rf /app/public/uploads/* && tar xzf - -C /app/public" < "$UPLOADS_FILE"

echo "Restore complete."
