#!/usr/bin/env python3
"""
Live check of the per-event storage quota (review finding: quota bypassable).

The quota introduced in this branch is enforced in POST /api/upload from the
*declared* Upload-Length header, and MediaRepository then bills
`media.original_size` - which is that same declaration. Nothing on the PATCH
path compares the incoming chunk against the length the client declared, and
appendUploadChunk() writes `incomingData` unconditionally, so a client may send
more bytes than it announced. The quota then accounts for the declaration while
the disk holds the real bytes.

This script proves it either way, so it can be run against the vulnerable build
and again after the fix:

    python3 scripts/verify-quota-overshoot.py

Exit code 0 = quota holds (fixed build). Exit code 1 = quota bypassable.

Chunk sizes stay below SvelteKit's BODY_SIZE_LIMIT (512 KB on bare metal,
2 MB in the Docker image), so a rejection is the app's own length check and not
the framework's body cap - otherwise this would measure the wrong thing.
"""
import base64
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import time

PORT = 4521
BASE = f"http://127.0.0.1:{PORT}"
WD = "/tmp/verify-quota-overshoot"
# Resolve the repo from this file's own location so the check runs on any checkout.
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(REPO, "build", "index.js")

KB = 1024
MB = 1024 * 1024

# Stay under the 512 KB framework cap on a default (non-Docker) deployment.
# 6.25x the declared size is already far beyond any rounding argument.
DECLARED = 64 * KB
CHUNK = 400 * KB
QUOTA_MB = 2

passed = 0
failed = 0


def ok(msg):
    global passed
    passed += 1
    print(f"  PASS: {msg}")


def bad(msg):
    global failed
    failed += 1
    print(f"  FAIL: {msg}")


def curl(*args, timeout=40):
    r = subprocess.run(
        ["curl", "-s", "--max-time", str(timeout), *args],
        capture_output=True, text=True,
    )
    return r.stdout


def status(*args, timeout=60):
    """curl -w '%{http_code}' without the body."""
    return subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "--max-time", str(timeout),
         "-w", "%{http_code}", *args],
        capture_output=True, text=True,
    ).stdout.strip()


def health_up():
    for _ in range(60):
        if curl(f"{BASE}/api/health", timeout=3).strip():
            return True
        time.sleep(0.5)
    return False


def b64(value):
    if isinstance(value, str):
        value = value.encode()
    return base64.b64encode(value).decode().rstrip("=")


def blobs_on_disk():
    """Every byte the instance has written under its blob directory."""
    root = os.path.join(WD, "data", "blobs")
    total, files = 0, []
    for dirpath, _, names in os.walk(root):
        for n in names:
            p = os.path.join(dirpath, n)
            size = os.path.getsize(p)
            total += size
            files.append((size, n))
    return total, sorted(files, reverse=True)


def kill_leftover_server():
    """Only free a leftover server that is *our* build on *our* port. A broad
    `pgrep -f 'node .*build/index.js'` would kill unrelated Node processes."""
    for pid in subprocess.run(
        ["pgrep", "-f", re.escape(f"node {BUILD}")], capture_output=True, text=True
    ).stdout.split():
        try:
            with open(f"/proc/{int(pid)}/environ", "rb") as fh:
                environ = fh.read().decode(errors="replace")
        except Exception:
            continue
        if f"PORT={PORT}" not in environ:
            continue
        try:
            os.kill(int(pid), 15)
        except Exception:
            pass


def main():
    kill_leftover_server()
    time.sleep(1)
    subprocess.run(["rm", "-rf", WD], check=False)
    os.makedirs(WD, exist_ok=True)

    env = dict(os.environ, PORT=str(PORT), ORIGIN=BASE, BASE_URL=BASE,
               ENCRYPTION_PASSPHRASE="quota-overshoot-pass")
    log = open("/tmp/verify-quota-overshoot.log", "w")
    proc = subprocess.Popen(["node", BUILD], cwd=WD, env=env, stdout=log, stderr=log)

    try:
        if not health_up():
            print("  server did not start")
            print(open("/tmp/verify-quota-overshoot.log").read()[-2000:])
            return 1
        ok("server is up")

        # --- host account via the real UI (PoW solved here) ------------------
        jar = f"{WD}/jar-host.txt"

        def register():
            subprocess.run(["rm", "-f", jar], check=False)
            page = curl("-c", jar, f"{BASE}/register")

            def field(name):
                m = re.search(rf'{name}" value="([^"]+)"', page)
                return m.group(1) if m else ""

            c, d, e, s = (field(k) for k in ("challenge", "difficulty", "expiresAt", "signature"))
            if not c:
                raise RuntimeError("no PoW challenge on /register")
            nonce = 0
            while not hashlib.sha256((c + str(nonce)).encode()).hexdigest().startswith("0" * int(d)):
                nonce += 1
            curl("-o", "/dev/null", "-b", jar, "-c", jar, "-X", "POST", f"{BASE}/register",
                 "-H", f"Origin: {BASE}", "-H", "Content-Type: application/x-www-form-urlencoded",
                 "--data-urlencode", f"email=host{int(time.time())}@quota-verify.test",
                 "--data-urlencode", "password=SuperSecret123!",
                 "--data-urlencode", f"challenge={c}", "--data-urlencode", f"nonce={nonce}",
                 "--data-urlencode", f"difficulty={d}", "--data-urlencode", f"expiresAt={e}",
                 "--data-urlencode", f"signature={s}")

        register()

        # --- event -------------------------------------------------------------
        ev = curl("-b", jar, "-c", jar, "-X", "POST", f"{BASE}/events/new",
                  "-H", f"Origin: {BASE}", "-H", "Content-Type: application/x-www-form-urlencoded",
                  "--data-urlencode", "title=Quota Event", "--data-urlencode", "dateStart=2026-09-01T18:00",
                  "--data-urlencode", "dateEnd=2026-09-01T23:00", "--data-urlencode", "accentColor=#007AFF")
        m = re.search(r"/events/([0-9a-f-]{36})", ev)
        event_id = m.group(1) if m else None
        if not event_id:
            bad("event creation failed")
            print(ev[:400])
            return 1
        print(f"  event {event_id}")

        # Shrink the quota through the app's own admin action so the test is quick.
        curl("-o", "/dev/null", "-b", jar, "-c", jar, "-X", "POST", f"{BASE}/admin?/saveSettings",
             "-H", f"Origin: {BASE}", "-H", "Content-Type: application/x-www-form-urlencoded",
             "--data-urlencode", "maxUploadSizeMb=500", "--data-urlencode", f"quotaPerEventMb={QUOTA_MB}",
             "--data-urlencode", "smtpHost=", "--data-urlencode", "smtpPort=587",
             "--data-urlencode", "smtpUser=", "--data-urlencode", "smtpPass=",
             "--data-urlencode", "smtpFrom=")
        print(f"  quotaPerEventMb set to {QUOTA_MB} MB")

        # --- guest of this event ------------------------------------------------
        tok_resp = curl("-b", jar, "-X", "POST", f"{BASE}/events/{event_id}?/regenerateToken",
                        "-H", f"Origin: {BASE}",
                        "-H", "Content-Type: application/x-www-form-urlencoded")
        # SvelteKit form actions answer with a devalue-serialized payload:
        #   {"type":"success","status":200,"data":"[{\"newToken\":1},\"<token>\"]"}
        invite = ""
        try:
            outer = json.loads(tok_resp)
            data = json.loads(outer.get("data", "[]"))
            if isinstance(data, list) and data and isinstance(data[0], dict):
                idx = data[0].get("newToken")
                if isinstance(idx, int) and 0 <= idx < len(data):
                    invite = str(data[idx])
        except Exception as exc:
            print(f"  (payload parse failed: {exc})")
        if not invite:
            m = re.findall(r"[A-Za-z0-9_-]{22,}", tok_resp)
            invite = m[-1] if m else ""
        if not invite:
            bad("could not obtain the event invite token")
            print(tok_resp[:600])
            return 1

        jar_guest = f"{WD}/jar-guest.txt"
        subprocess.run(["rm", "-f", jar_guest], check=False)
        join = curl("-b", jar_guest, "-c", jar_guest, "-X", "POST", f"{BASE}/e/{invite}?/setName",
                    "-H", f"Origin: {BASE}",
                    "-H", "Content-Type: application/x-www-form-urlencoded",
                    "--data-urlencode", "name=Overshoot Guest")
        if '"type":"error"' in join or '"type":"failure"' in join:
            bad("guest could not join - the check would be a no-op")
            print(join[:400])
            return 1
        # Prove the guest is real before drawing any conclusion from the upload.
        own = curl("-b", jar_guest, "-X", "POST", f"{BASE}/e/{invite}?/addWallPost",
                   "-H", f"Origin: {BASE}",
                   "-H", "Content-Type: application/x-www-form-urlencoded",
                   "--data-urlencode", "content=kontrolle")
        if '"type":"success"' not in own:
            bad("control case failed - guest session not established")
            return 1
        ok("guest is a real, functioning guest of the event")

        guest_cookie = f"dev_tok_{event_id[:8]}"
        guest_token = ""
        for line in open(jar_guest):
            if guest_cookie in line:
                parts = line.split("\t")
                if len(parts) >= 7:
                    guest_token = parts[6].strip()
        if not guest_token:
            bad(f"no {guest_cookie} in the guest cookie jar")
            return 1

        # --- payload ------------------------------------------------------------
        payload = os.path.join(WD, "payload.bin")
        with open(payload, "wb") as fh:
            fh.truncate(CHUNK)
        print(f"  payload: {CHUNK:,} B of zeros")

        def new_session(size, name):
            code = status("-X", "POST", f"{BASE}/api/upload",
                          "-H", f"Origin: {BASE}",
                          "-H", "Tus-Resumable: 1.0.0",
                          "-H", f"Upload-Length: {size}",
                          "-H", f"Upload-Metadata: eventId {b64(event_id)},"
                                f"filename {b64(name)},filetype application/octet-stream",
                          "-H", f"X-Guest-Token: {guest_token}",
                          "-H", "Content-Length: 0")
            # TusServer.createUpload() uses the same id for session and media row,
            # so the newest media row identifies the session without scraping the
            # Location header.
            row = sqlite3.connect(f"{WD}/data/app.db").execute(
                "SELECT id FROM media WHERE event_id = ? ORDER BY rowid DESC LIMIT 1",
                (event_id,)).fetchone()
            return code, (row[0] if row else "")

        def patch(sid, offset, path):
            return status("-X", "PATCH", f"{BASE}/api/upload/{sid}",
                          "-H", f"Origin: {BASE}",
                          "-H", "Tus-Resumable: 1.0.0",
                          "-H", "Content-Type: application/offset+octet-stream",
                          "-H", f"Upload-Offset: {offset}",
                          "-H", f"X-Guest-Token: {guest_token}",
                          "--data-binary", f"@{path}")

        # --- control: declare what you send -------------------------------------
        print(f"\n=== CONTROL: declare {DECLARED:,} B and send exactly that ===")
        honest_path = os.path.join(WD, "honest.bin")
        with open(honest_path, "wb") as fh:
            fh.truncate(DECLARED)
        code, sid = new_session(DECLARED, b"honest.bin")
        print(f"  POST /api/upload -> {code}")
        if code != "201":
            bad(f"honest session refused ({code})")
            return 1
        rc = patch(sid, 0, honest_path)
        print(f"  PATCH {DECLARED:,} B -> {rc}")
        if rc == "204":
            ok("an honest upload of the declared size is accepted")
        else:
            bad(f"honest upload rejected with {rc} - the upload path itself is broken")

        baseline, _ = blobs_on_disk()
        print(f"  bytes on disk after the control upload: {baseline:,}")

        # --- attack: declare little, send much ----------------------------------
        print(f"\n=== ATTACK: declare {DECLARED:,} B, send {CHUNK:,} B "
              f"({CHUNK / DECLARED:.2f}x) in one chunk ===")
        code, sid2 = new_session(DECLARED, b"overshoot.bin")
        print(f"  POST /api/upload (Upload-Length: {DECLARED}) -> {code}")
        if code != "201":
            print(f"  quota refused the session outright (HTTP {code}) - cannot bypass")
            total, _ = blobs_on_disk()
            ok(f"quota refused the declaration (HTTP {code}, {total:,} B on disk)")
            print_verdict(False, DECLARED, total)
            return 0

        rc = patch(sid2, 0, payload)
        print(f"  PATCH {CHUNK:,} B at offset 0 -> {rc}")

        total, files = blobs_on_disk()
        written = total - baseline

        db = sqlite3.connect(f"{WD}/data/app.db")
        row = db.execute(
            "SELECT status, original_size FROM media WHERE event_id = ? ORDER BY rowid DESC LIMIT 1",
            (event_id,)).fetchone()
        db.close()
        billed = row[1] if row else 0
        media_status = row[0] if row else "?"

        print(f"\n  bytes on disk for this session: {written:,} "
              f"({written / DECLARED:.2f}x the declaration)")
        for size, name in files[:4]:
            print(f"    {size:>12,} B  {name}")
        print(f"  media row: status={media_status} original_size={billed:,} "
              f"(this is what the quota bills)")
        if billed != written and written > 0:
            print(f"  -> the quota accounts {billed:,} B for {written:,} B actually stored")

        if rc == "204" and written > DECLARED:
            bad(f"quota bypassed: declared {DECLARED:,} B, wrote {written:,} B "
                f"({written / DECLARED:.2f}x), both answered HTTP 204")
            print_verdict(True, DECLARED, written)
            return 1

        if rc == "204" and written <= DECLARED:
            ok(f"overshoot chunk accepted but capped at the declared length "
               f"({written:,} B written)")
            print_verdict(False, DECLARED, written)
            return 0

        # Any other status: the server refused the oversized chunk.
        if rc in ("409", "413", "400", "403"):
            ok(f"overshoot refused with HTTP {rc} "
               f"({written:,} B written of {CHUNK:,} B offered)")
            print_verdict(False, DECLARED, written)
            return 0

        bad(f"unexpected PATCH status {rc}, cannot judge the quota")
        return 1

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        log.close()


def print_verdict(bypassed, declared, written):
    print("\n" + "=" * 62)
    print("RESULT")
    print("=" * 62)
    print(f"  declared Upload-Length : {declared:,} B")
    print(f"  bytes actually stored  : {written:,} B")
    if bypassed:
        print("  VERDICT: BYPASSED - the quota is billed from the declaration,")
        print("           not from the bytes the client actually sends.")
        print("           Fix: reject or truncate a PATCH chunk that exceeds the")
        print("           remaining declared length, before appendUploadChunk().")
    else:
        print("  VERDICT: HELD - stored bytes stay within the declared length.")
    print("=" * 62)


if __name__ == "__main__":
    sys.exit(main())
