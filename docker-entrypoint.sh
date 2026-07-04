#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node scripts/migrate.mjs

echo "[entrypoint] Starting application server..."
exec node dist/index.js
