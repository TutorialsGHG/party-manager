#!/bin/bash
# Focused re-check of the two remaining questions from verify-live-fixes.sh:
#   1. Is the login throttle actually active? (SvelteKit form actions wrap
#      fail() in a 200 response, so the status code alone proves nothing.)
#   2. Can a stranger hijack a LIVE upload session? (The earlier test completed
#      the upload first, so the session was already gone -> 404, not 401.)
set -u
cd /home/hermes/workspace/party-manager

PORT=4506
WD=/tmp/verify-live2
BASE="http://127.0.0.1:$PORT"
PASS=0; FAIL=0
ok()  { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

for pid in $(pgrep -f 'node .*build/index\.js' 2>/dev/null || true); do
  [ "$pid" = "$$" ] && continue; kill "$pid" 2>/dev/null || true
done
sleep 1
rm -rf "$WD"; mkdir -p "$WD"

( cd "$WD" && env PORT=$PORT ORIGIN="$BASE" BASE_URL="$BASE" ENCRYPTION_PASSPHRASE=live2-pass \
    node /home/hermes/workspace/party-manager/build/index.js > /tmp/verify-live2.log 2>&1 &
  echo $! > /tmp/verify-live2.pid )
for _ in $(seq 1 60); do curl -sf "$BASE/api/health" >/dev/null 2>&1 && break; sleep 0.5; done
curl -sf "$BASE/api/health" >/dev/null 2>&1 || { echo "server down"; tail -5 /tmp/verify-live2.log; exit 1; }
ok "server is up"

echo
echo "=== 1. Login throttle: inspect the RESPONSE BODY, not the status ==="
BODIES=""
for i in 1 2 3 4 5 6 7; do
  B=$(curl -s -X POST "$BASE/login" -H "Origin: $BASE" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      --data-urlencode "email=throttle@verify.test" --data-urlencode "password=wrong-$i" \
      | grep -oE "(Ungültige E-Mail-Adresse oder falsches Passwort|zu viele fehlgeschlagene Versuche|Too many|Zu viele)[^<]*" | head -1)
  BODIES="$BODIES | $B"
done
echo "  responses:$BODIES"
if printf '%s' "$BODIES" | grep -qi "zu viele fehlgeschlagene versuche"; then
  ok "after repeated failures the account is throttled (throttle message returned)"
else
  bad "throttle message never appeared: $BODIES"
fi

echo
echo "=== 2. Throttle is per account: a different account still gets the normal error ==="
B2=$(curl -s -X POST "$BASE/login" -H "Origin: $BASE" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data-urlencode "email=someone-else@verify.test" --data-urlencode "password=wrong" \
     | grep -oE "(Ungültige E-Mail-Adresse oder falsches Passwort|zu viele fehlgeschlagene Versuche)" | head -1)
echo "  other account -> ${B2:-<none>}"
if printf '%s' "$B2" | grep -qi "falsches Passwort"; then
  ok "other account unaffected by another account's failures (shared-NAT safe)"
else
  bad "other account was also throttled: $B2"
fi

echo
echo "=== 3. Register a host and create an event ==="
JAR=/tmp/jar-live2.txt; rm -f "$JAR"
CHAL=$(curl -s -c "$JAR" "$BASE/register" | python3 -c "
import sys, re
h = sys.stdin.read()
def f(n):
    m = re.search(rf'{n}\" value=\"([^\"]+)\"', h)
    return m.group(1) if m else ''
print(f('challenge'), f('difficulty'), f('expiresAt'), f('signature'))
")
read -r C D E S <<< "$CHAL"
NONCE=$(python3 -c "
import hashlib,sys
c,d=sys.argv[1],int(sys.argv[2])
for i in range(50_000_000):
    if hashlib.sha256((c+str(i)).encode()).hexdigest().startswith('0'*d): print(i); break
" "$C" "$D")
curl -s -b "$JAR" -c "$JAR" -o /dev/null -X POST "$BASE/register" -H "Origin: $BASE" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=host@verify.test" --data-urlencode "password=SuperSecret123!" \
  --data-urlencode "challenge=$C" --data-urlencode "nonce=$NONCE" \
  --data-urlencode "difficulty=$D" --data-urlencode "expiresAt=$E" --data-urlencode "signature=$S"
curl -s -o /dev/null -b "$JAR" -c "$JAR" -X POST "$BASE/events/new" -H "Origin: $BASE" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "title=Hijack Test" --data-urlencode "dateStart=2026-09-01T18:00" \
  --data-urlencode "dateEnd=2026-09-01T23:00" --data-urlencode "accentColor=#007AFF"
EVID=$(curl -s -b "$JAR" -L "$BASE/dashboard" | grep -oE '/events/[0-9a-f-]{36}' | head -1 | sed 's|/events/||')
echo "  event id: ${EVID:-<none>}"
[ -n "$EVID" ] && ok "event created" || bad "no event id"

echo
echo "=== 4. Hijack a LIVE (incomplete) upload session ==="
if [ -n "$EVID" ]; then
  # Declare a 100-byte upload but send only 10 bytes -> session stays open.
  LOC=$(curl -s -D - -o /dev/null -b "$JAR" -X POST "$BASE/api/upload" \
    -H "Origin: $BASE" -H "Tus-Resumable: 1.0.0" -H "Upload-Length: 100" \
    -H "Upload-Metadata: filename dGVzdA==,filetype aW1hZ2UvcG5n,eventId $(printf %s "$EVID" | base64 -w0)" \
    | grep -i '^location:' | tr -d '\r' | awk '{print $2}')
  echo "  live session: ${LOC:-<none>}"
  if [ -n "$LOC" ]; then
    # Owner sends 10 of 100 bytes.
    curl -s -o /dev/null -b "$JAR" -X PATCH "$BASE$LOC" -H "Tus-Resumable: 1.0.0" \
      -H "Upload-Offset: 0" -H "Content-Type: application/offset+octet-stream" --data-binary "0123456789"
    HEAD_OWNER=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -I "$BASE$LOC" -H "Tus-Resumable: 1.0.0")
    OFF_OWNER=$(curl -s -D - -o /dev/null -b "$JAR" -I "$BASE$LOC" -H "Tus-Resumable: 1.0.0" | grep -i '^upload-offset' | tr -d '\r' | awk '{print $2}')
    echo "  owner HEAD -> $HEAD_OWNER (offset $OFF_OWNER)"

    PUN=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE$LOC" -H "Tus-Resumable: 1.0.0" \
      -H "Upload-Offset: 10" -H "Content-Type: application/offset+octet-stream" --data-binary "EVIL-EVIL")
    echo "  stranger PATCH on live session -> $PUN (expect 401)"
    if [ "$PUN" = "401" ]; then ok "hijack of a live session blocked"; else bad "hijack possible ($PUN)"; fi

    HUN=$(curl -s -o /dev/null -w "%{http_code}" -I "$BASE$LOC" -H "Tus-Resumable: 1.0.0")
    echo "  stranger HEAD on live session -> $HUN (expect 401)"
    if [ "$HUN" = "401" ]; then ok "offset disclosure blocked"; else bad "HEAD leaks state ($HUN)"; fi

    DUN=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE$LOC" -H "Tus-Resumable: 1.0.0")
    echo "  stranger DELETE on live session -> $DUN (expect 401)"
    if [ "$DUN" = "401" ]; then ok "stranger cannot cancel the upload"; else bad "stranger can cancel ($DUN)"; fi

    # The rightful owner must still be able to continue.
    POK=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X PATCH "$BASE$LOC" -H "Tus-Resumable: 1.0.0" \
      -H "Upload-Offset: 10" -H "Content-Type: application/offset+octet-stream" --data-binary "abcdefghij")
    echo "  owner resumes PATCH -> $POK (expect 204)"
    if [ "$POK" = "204" ]; then ok "legitimate upload unaffected by the attack attempt"; else bad "owner blocked ($POK)"; fi
  fi
fi

kill "$(cat /tmp/verify-live2.pid)" 2>/dev/null || true
echo
echo "=== RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ]
