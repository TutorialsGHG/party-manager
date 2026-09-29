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

# The master private key encrypts every guest name, event and media file.
# Without a passphrase it is stored in cleartext, so a leaked /config volume
# (backup, disk image, volume misconfiguration) hands over all plaintext data.
# The application itself refuses to create a new unencrypted key, so fail early
# and loudly with the exact remedy instead of a cryptic stack trace later on.
if [ -z "${ENCRYPTION_PASSPHRASE}" ]; then
  echo ""
  echo "  [Einladung] WARNING: ENCRYPTION_PASSPHRASE is not set."
  echo "  The master private key is stored unencrypted in /config/keys."
  echo "  Generate one with:  openssl rand -base64 32"
  echo "  and add it to your .env file. Existing installations keep working,"
  echo "  but new ones will refuse to start without it."
  echo ""
else
  echo "[Einladung] ENCRYPTION_PASSPHRASE is set - master key will be encrypted at rest."
fi

echo "[Einladung] Starting application on port ${PORT:-3000}..."
exec "$@"
