#!/bin/sh
set -e

echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy

if [ "$SKIP_SEED" != "true" ]; then
  echo "Seeding initial owner account (skipped automatically if one already exists)..."
  node_modules/.bin/tsx prisma/seed.ts || echo "Seed step failed or already applied, continuing."
fi

exec "$@"
