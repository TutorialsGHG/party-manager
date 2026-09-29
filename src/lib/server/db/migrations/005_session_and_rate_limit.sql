-- Session idle timeout support and login throttling.
-- Existing migrations must never be modified, so this adds new columns/tables only.

-- Idle timeout: last_seen_at is refreshed on every successful validation.
ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;

-- Login brute-force protection, keyed by account (never by IP: all guests of one
-- school network share a single public IP behind NAT).
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_hash TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_account ON login_attempts(account_hash, attempted_at);
