ALTER TABLE events ADD COLUMN max_companions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guests ADD COLUMN companion_invite_id TEXT REFERENCES companion_invites(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS companion_invites (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  owner_guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  claimed_by_guest_id TEXT REFERENCES guests(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_companion_invites_event ON companion_invites(event_id);
CREATE INDEX IF NOT EXISTS idx_companion_invites_owner ON companion_invites(owner_guest_id);
