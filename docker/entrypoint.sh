#!/bin/sh
set -e

# Ensure required persistent storage subdirectories exist
mkdir -p /data/blobs/temp
mkdir -p /config/keys/events

echo "[Einladung] Starting application on port ${PORT:-3000}..."
exec "$@"
