#!/usr/bin/env python3
"""
Live reproduction of DB-01 (poll IDOR) against a running production build.

A guest of event B tries to (1) vote in a poll of event A and (2) add an option
to that poll. Before the fix both succeeded; the injected option was encrypted
with B's event key, which then broke AES-GCM authentication when A's host loaded
the event - the host saw HTTP 500 and the event was permanently unusable.

State is set up by talking to the repository layer inside the running instance's
data directory, which is far more robust than scraping tokens out of HTML.
"""
import os
import re
import sys
import json
import time
import hashlib
import sqlite3
import subprocess

PORT = 4509
BASE = f"http://127.0.0.1:{PORT}"
WD = "/tmp/verify-idor-py"
REPO = "/home/hermes/workspace/party-manager"

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


def curl(*args, timeout=25):
    r = subprocess.run(
        ["curl", "-s", "--max-time", str(timeout), *args],
        capture_output=True, text=True,
    )
    return r.stdout


def health_up():
    for _ in range(60):
        if curl(f"{BASE}/api/health", timeout=3).strip():
            return True
        time.sleep(0.5)
    return False


def main():
    global passed, failed

    for pid in subprocess.run(
        ["pgrep", "-f", r"node .*build/index\.js"], capture_output=True, text=True
    ).stdout.split():
        try:
            os.kill(int(pid), 15)
        except Exception:
            pass
    time.sleep(1)
    subprocess.run(["rm", "-rf", WD], check=False)
    os.makedirs(WD, exist_ok=True)

    env = dict(os.environ, PORT=str(PORT), ORIGIN=BASE, BASE_URL=BASE,
               ENCRYPTION_PASSPHRASE="idor-py-pass")
    log = open("/tmp/verify-idor-py.log", "w")
    proc = subprocess.Popen(["node", f"{REPO}/build/index.js"], cwd=WD, env=env, stdout=log, stderr=log)

    try:
        if not health_up():
            print("  server did not start")
            print(open("/tmp/verify-idor-py.log").read()[-2000:])
            return 1
        ok("server is up")

        # --- registration via the real UI (PoW solved client-side) -------------
        def register(email):
            jar = f"/tmp/jar-py-{email}.txt"
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
                 "--data-urlencode", f"email={email}",
                 "--data-urlencode", "password=SuperSecret123!",
                 "--data-urlencode", f"challenge={c}", "--data-urlencode", f"nonce={nonce}",
                 "--data-urlencode", f"difficulty={d}", "--data-urlencode", f"expiresAt={e}",
                 "--data-urlencode", f"signature={s}")
            return jar

        def create_event(jar):
            curl("-o", "/dev/null", "-b", jar, "-c", jar, "-X", "POST", f"{BASE}/events/new",
                 "-H", f"Origin: {BASE}", "-H", "Content-Type: application/x-www-form-urlencoded",
                 "--data-urlencode", "title=Event", "--data-urlencode", "dateStart=2026-09-01T18:00",
                 "--data-urlencode", "dateEnd=2026-09-01T23:00",
                 "--data-urlencode", "accentColor=#007AFF")
            page = curl("-b", jar, "-L", f"{BASE}/dashboard")
            m = re.findall(r"/events/([0-9a-f-]{36})", page)
            return m[0] if m else None

        print("\n=== Two independent hosts, two independent events ===")
        jar_a = register("hostA@verify.test")
        jar_b = register("hostB@verify.test")
        ev_a = create_event(jar_a)
        ev_b = create_event(jar_b)
        print(f"  event A: {ev_a}\n  event B: {ev_b}")
        if not ev_a or not ev_b:
            bad("event creation failed")
            return 1
        ok("both events created")

        # --- host A creates a poll in event A --------------------------------
        print("\n=== Host A creates a poll in event A ===")
        curl("-o", "/dev/null", "-b", jar_a, "-X", "POST", f"{BASE}/events/{ev_a}?/createPoll",
             "-H", f"Origin: {BASE}", "-H", "Content-Type: application/x-www-form-urlencoded",
             "--data-urlencode", "question=Which music?",
             "--data-urlencode", "option=Pop", "--data-urlencode", "option=Rock",
             "--data-urlencode", "allowGuestOptions=1")
        page = curl("-b", jar_a, f"{BASE}/events/{ev_a}")
        m = re.findall(r'polls:\[\{id:"([0-9a-f-]{36})"', page)
        poll_id = m[0] if m else None
        print(f"  poll id: {poll_id}")
        if not poll_id:
            bad("no poll found in event A")
            return 1
        ok("poll created in event A")

        # Read the poll's option ids and event A's invite token straight from SQLite.
        db = sqlite3.connect(f"{WD}/data/app.db")
        cur = db.cursor()
        opt_ids = [r[0] for r in cur.execute(
            "SELECT id FROM poll_options WHERE poll_id = ? ORDER BY sort_order", (poll_id,))]
        token_a = cur.execute("SELECT id FROM events WHERE id = ?", (ev_a,)).fetchone()
        # The plaintext invite token cannot be recovered (only its hash is stored),
        # so give event B's host a fresh token through the regenerate action.
        db.close()
        print(f"  options: {opt_ids}")

        if not opt_ids:
            bad("poll has no options")
            return 1

        # --- guest of event B joins event B, then attacks event A's poll -------
        print("\n=== Guest of event B joins event B ===")
        tok_resp = curl("-b", jar_b, "-X", "POST", f"{BASE}/events/{ev_b}?/regenerateToken",
                        "-H", f"Origin: {BASE}",
                        "-H", "Content-Type: application/x-www-form-urlencoded")
        # SvelteKit form actions answer with a devalue-serialized payload:
        #   {"type":"success","status":200,"data":"[{\"newToken\":1},\"<token>\"]"}
        # The object references its values by array index, so the token is whichever
        # string element sits at the referenced index. devalue may prefix the string
        # with a type tag, so index by position instead of pattern-matching.
        invite_b = ""
        try:
            outer = json.loads(tok_resp)
            data = json.loads(outer.get("data", "[]"))
            if isinstance(data, list) and data and isinstance(data[0], dict):
                idx = data[0].get("newToken")
                if isinstance(idx, int) and 0 <= idx < len(data):
                    invite_b = str(data[idx])
        except Exception as exc:
            print(f"  (payload parse failed: {exc})")
        if not invite_b:
            m = re.findall(r'[A-Za-z0-9_-]{22,}', tok_resp)
            invite_b = m[-1] if m else ""
        print(f"  event B invite token: {invite_b or '<not extracted>'}")
        if not invite_b:
            print("  --- response snippet ---")
            print(tok_resp[:1500])
            bad("could not obtain event B invite token")
            return 1
        ok("obtained event B invite token")

        jar_guest = "/tmp/jar-py-guestB.txt"
        subprocess.run(["rm", "-f", jar_guest], check=False)
        # The guest name form is a named action (?/setName), not the default action.
        join = curl("-b", jar_guest, "-c", jar_guest, "-X", "POST", f"{BASE}/e/{invite_b}?/setName",
                    "-H", f"Origin: {BASE}",
                    "-H", "Content-Type: application/x-www-form-urlencoded",
                    "--data-urlencode", "name=Malicious Guest")

        # SvelteKit reports action problems in the payload, not the HTTP status.
        # A guest that never registered would silently make the attack a no-op and
        # the whole check meaningless, so fail loudly here.
        if '"type":"error"' in join or '"type":"failure"' in join:
            print("  --- guest join response ---")
            print(join[:600])
            bad("guest could not join event B - attack would be a no-op")
            return 1

        # Confirm the guest is real by posting in its own event (control case).
        own = curl("-b", jar_guest, "-X", "POST", f"{BASE}/e/{invite_b}?/addWallPost",
                   "-H", f"Origin: {BASE}",
                   "-H", "Content-Type: application/x-www-form-urlencoded",
                   "--data-urlencode", "content=kontrolle")
        if '"type":"success"' not in own:
            print("  --- control response ---")
            print(own[:600])
            bad("control case failed, guest session not established")
            return 1
        ok("guest of event B is a real, functioning guest")

        print("\n=== ATTACK: guest of B targets A's poll ===")
        vote_args = ["-b", jar_guest, "-o", "/dev/null", "-w", "%{http_code}",
                     "-X", "POST", f"{BASE}/e/{invite_b}?/votePoll",
                     "-H", f"Origin: {BASE}",
                     "-H", "Content-Type: application/x-www-form-urlencoded",
                     "--data-urlencode", f"pollId={poll_id}"]
        for oid in opt_ids[:1]:
            vote_args += ["--data-urlencode", f"optionId={oid}"]
        v = subprocess.run(["curl", "-s", "--max-time", "25", *vote_args],
                           capture_output=True, text=True).stdout
        print(f"  vote in foreign poll -> {v[:160]}")

        a = curl("-b", jar_guest, "-X", "POST", f"{BASE}/e/{invite_b}?/addPollOption",
                 "-H", f"Origin: {BASE}",
                 "-H", "Content-Type: application/x-www-form-urlencoded",
                 "--data-urlencode", f"pollId={poll_id}",
                 "--data-urlencode", "text=Injected Option")
        print(f"  add option to foreign poll -> {a[:160]}")

        # Verify at the database level that nothing was written to event A's poll.
        db = sqlite3.connect(f"{WD}/data/app.db")
        cur = db.cursor()
        foreign_options = cur.execute(
            "SELECT COUNT(*) FROM poll_options WHERE poll_id = ?", (poll_id,)).fetchone()[0]
        foreign_votes = cur.execute(
            "SELECT COUNT(*) FROM poll_votes WHERE poll_id = ?", (poll_id,)).fetchone()[0]
        db.close()
        print(f"  options in A's poll now: {foreign_options} (expected {len(opt_ids)})")
        print(f"  votes in A's poll now:   {foreign_votes} (expected 0)")

        if foreign_options == len(opt_ids):
            ok("no foreign option was written into event A's poll")
        else:
            bad("foreign option leaked into event A's poll")
        if foreign_votes == 0:
            ok("no foreign vote was recorded in event A's poll")
        else:
            bad("foreign vote was recorded in event A's poll")

        print("\n=== CRITICAL: does event A still load for its host? ===")
        hostpage = curl("-b", jar_a, "-o", "/dev/null", "-w", "%{http_code}", f"{BASE}/events/{ev_a}")
        print(f"  host A loads event A -> HTTP {hostpage}  (500 == still poisoned)")
        if hostpage == "200":
            ok("event A still loads for its host")
        else:
            bad(f"event A returns {hostpage} - attack still poisons the event")

        body = curl("-b", jar_a, f"{BASE}/events/{ev_a}")
        if "Injected Option" in body:
            bad("'Injected Option' is visible on host A's page")
        else:
            ok("no injected content on host A's page")

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        log.close()

    print(f"\n=== RESULT: {passed} passed, {failed} failed ===")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
