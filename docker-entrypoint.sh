#!/bin/sh
set -e

echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy

if [ "$SKIP_SEED" != "true" ]; then
  echo "Seeding initial owner account (skipped automatically if one already exists)..."
  node_modules/.bin/tsx prisma/seed.ts || echo "Seed step did not create an owner account — see the error above (often a missing/weak SEED_OWNER_PASSWORD). Fix .env and restart the app container; the rest of the app will still start."
fi

exec "$@"
