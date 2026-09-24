#!/bin/sh
# Applies any pending migrations before the API starts serving. Safe to run on
# every container start: `migrate deploy` is a no-op when the schema is
# already current, so this works for both the first boot and every restart.
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

exec "$@"
