#!/bin/bash
# Verifies the master-key fail-closed behavior of the real production build.
#   1. Fresh install WITHOUT passphrase  -> must refuse to start
#   2. Fresh install WITH passphrase     -> must start and write an encrypted key
#   3. Existing unencrypted key          -> must still start (no breakage for current users)
set -u
cd /home/hermes/workspace/party-manager

# Never let a leftover server from a previous run answer our health check on the
# same port, which would make these assertions pass or fail for the wrong reason.
# Scoped to node processes only, and this script's own PID is never matched.
for pid in $(pgrep -f 'node .*build/index\.js' 2>/dev/null || true); do
  [ "$pid" = "$$" ] && continue
  kill "$pid" 2>/dev/null || true
done
sleep 1

PASS=0; FAIL=0
ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

start_server() { # $1=workdir name, $2=port, rest = env assignments
  local wd="verify-$1"; local port="$2"; shift 2
  rm -rf "/tmp/$wd"; mkdir -p "/tmp/$wd"
  ( cd /tmp/$wd && env PORT="$port" ORIGIN="http://127.0.0.1:$port" BASE_URL="http://127.0.0.1:$port" \
      "$@" node /home/hermes/workspace/party-manager/build/index.js > "/tmp/$wd.log" 2>&1 &
    echo $! > "/tmp/$wd.pid" )
  for _ in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then sleep 0.5; return 0; fi
    if ! kill -0 "$(cat "/tmp/$wd.pid")" 2>/dev/null; then return 1; fi
    sleep 0.5
  done
  return 1
}
stop_server() { local wd="verify-$1"; kill "$(cat "/tmp/$wd.pid")" 2>/dev/null; sleep 1; }

echo "=== Building production bundle ==="
pnpm build >/tmp/verify-build.log 2>&1 || { echo "  BUILD FAILED"; tail -5 /tmp/verify-build.log; exit 1; }

echo
echo "=== 1. Fresh install WITHOUT ENCRYPTION_PASSPHRASE (must refuse) ==="
if start_server nopass 4401; then
  bad "server started without passphrase (should refuse)"
  stop_server nopass
else
  if grep -q "Refusing to store the master private key unencrypted" /tmp/verify-nopass.log; then
    ok "server refused to start, clear error shown"
  else
    bad "server refused but without the expected message"
    tail -3 /tmp/verify-nopass.log
  fi
fi

echo
echo "=== 2. Fresh install WITH passphrase (must start, encrypted key) ==="
if start_server withpass 4402 ENCRYPTION_PASSPHRASE=verify-passphrase; then
  if [ -f /tmp/verify-withpass/config/keys/master_priv.pem.enc ]; then
    ok "server started and master key stored encrypted (.enc)"
  else
    bad "server started but no encrypted key file found"
  fi
  if [ -f /tmp/verify-withpass/config/keys/master_priv.pem ]; then
    bad "UNENCRYPTED private key present - this is the vulnerability"
  else
    ok "no unencrypted private key on disk"
  fi
  stop_server withpass
else
  bad "server did not start with a valid passphrase"
  tail -5 /tmp/verify-withpass.log
fi

echo
echo "=== 3. Existing UNENCRYPTED key, no passphrase (must keep working) ==="
rm -rf /tmp/verify-legacy; mkdir -p /tmp/verify-legacy/config/keys/events /tmp/verify-legacy/data/blobs
# Boot once with the explicit override to create a legacy-style unencrypted install.
( cd /tmp/verify-legacy && env PORT=4403 ORIGIN="http://127.0.0.1:4403" BASE_URL="http://127.0.0.1:4403" \
    ALLOW_UNENCRYPTED_MASTER_KEY=true node /home/hermes/workspace/party-manager/build/index.js > /tmp/verify-legacy-boot.log 2>&1 &
  echo $! > /tmp/verify-legacy.pid )
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:4403/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
stop_pid() { kill "$(cat "$1")" 2>/dev/null; }
stop_pid /tmp/verify-legacy.pid; sleep 1

if [ -f /tmp/verify-legacy/config/keys/master_priv.pem ]; then
  ok "override produced a legacy unencrypted key"
  # Restart WITHOUT the override: the existing key must still be accepted.
  ( cd /tmp/verify-legacy && env PORT=4404 ORIGIN="http://127.0.0.1:4404" BASE_URL="http://127.0.0.1:4404" \
      node /home/hermes/workspace/party-manager/build/index.js > /tmp/verify-legacy2.log 2>&1 &
    echo $! > /tmp/verify-legacy2.pid )
  started=1
  for _ in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:4404/api/health" >/dev/null 2>&1; then started=0; break; fi
    sleep 0.5
  done
  stop_pid /tmp/verify-legacy2.pid
  if [ "$started" = "0" ]; then
    ok "existing installation still starts without a passphrase (no breakage)"
  else
    bad "existing unencrypted install no longer starts"
    tail -3 /tmp/verify-legacy2.log
  fi
else
  bad "override did not produce an unencrypted key"
  tail -3 /tmp/verify-legacy-boot.log
fi

echo
echo "=== RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ]
