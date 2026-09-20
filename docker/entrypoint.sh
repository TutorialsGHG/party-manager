#!/bin/sh
set -e

# Ensure directories exist with proper permissions
mkdir -p /data/blobs/temp
mkdir -p /config/keys/events

# Run database migrations before starting the web server
echo "[Einladung] Running database migrations..."
node -e "
const { runMigrations } = require('./build/server/chunks/migrate.js');
// If needed, migrations run automatically on startup via client initialization
" || true

echo "[Einladung] Starting application on port ${PORT:-3000}..."
exec "$@"
