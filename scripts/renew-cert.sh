#!/bin/bash
# Renews the TLS certificate if it's due, then reloads Nginx.
#
# The `certbot` container keeps trying renewals on its own, but renewing
# the files on disk doesn't make Nginx pick up the new certificate — Nginx
# only re-reads certificate files on a reload. This script asks certbot to
# renew (a no-op if it isn't due yet) and then reloads Nginx unconditionally;
# reloading is cheap and safe to run even when nothing changed. Run this
# from the project directory (where docker-compose.yml lives), or set
# PROJECT_DIR. Intended to run via cron — see DEPLOY.md.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$PROJECT_DIR"

echo "[$(date)] Checking for certificate renewal..."
docker compose exec -T certbot certbot renew --quiet || true

echo "[$(date)] Reloading Nginx..."
docker compose exec -T nginx nginx -s reload

echo "[$(date)] Done."
