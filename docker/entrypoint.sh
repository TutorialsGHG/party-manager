#!/bin/sh
set -e

# Ensure required persistent storage subdirectories exist
mkdir -p /data/blobs/temp
mkdir -p /config/keys/events

# SvelteKit validates unsafe requests against ORIGIN. Keep it aligned with the
# public base URL unless an explicit canonical origin was supplied.
: "${BASE_URL:=http://localhost:${PORT:-3000}}"
: "${ORIGIN:=$BASE_URL}"
export BASE_URL ORIGIN

echo "[Einladung] Starting application on port ${PORT:-3000}..."
exec "$@"
