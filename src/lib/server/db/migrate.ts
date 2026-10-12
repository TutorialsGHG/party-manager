import { getDb } from './client';

/**
 * Embedded migrations registry.
 * Each entry is a [name, sql] tuple executed in order.
 * In production builds the src/ directory is not present, so we embed
 * migration SQL directly rather than reading from the filesystem.
 */
const MIGRATIONS: [name: string, sql: string][] = [
	[
		'001_initial.sql',
		`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email_hash TEXT UNIQUE NOT NULL,
  email_cipher TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'host',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes(user_id);

CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  credential_id TEXT UNIQUE NOT NULL,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id);

CREATE TABLE IF NOT EXISTS totp_secrets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_cipher TEXT NOT NULL,
  is_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_start TEXT NOT NULL,
  date_end TEXT,
  accent_color TEXT NOT NULL DEFAULT '#007AFF',
  title_cipher TEXT NOT NULL,
  description_cipher TEXT,
  location_name_cipher TEXT,
  location_address_cipher TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_token_hash ON events(token_hash);
CREATE INDEX IF NOT EXISTS idx_events_host ON events(host_id);

CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  device_token_hash TEXT NOT NULL,
  name_cipher TEXT NOT NULL,
  is_host INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(event_id, device_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_guests_event ON guests(event_id);

CREATE TABLE IF NOT EXISTS rsvps (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  companion_count INTEGER NOT NULL DEFAULT 0,
  companion_names_cipher TEXT,
  notes_cipher TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(event_id, guest_id)
);

CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  question_cipher TEXT NOT NULL,
  is_multiple INTEGER NOT NULL DEFAULT 0,
  allow_guest_options INTEGER NOT NULL DEFAULT 0,
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  deadline TEXT,
  is_closed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_polls_event ON polls(event_id);

CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  created_by_guest_id TEXT REFERENCES guests(id) ON DELETE SET NULL,
  text_cipher TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  guest_id TEXT REFERENCES guests(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

CREATE TABLE IF NOT EXISTS wall_posts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  content_cipher TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wall_posts_event ON wall_posts(event_id);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  uploader_guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL,
  original_size INTEGER NOT NULL,
  processed_size INTEGER,
  duration_seconds REAL,
  status TEXT NOT NULL DEFAULT 'uploading',
  salt TEXT NOT NULL,
  file_key_cipher TEXT NOT NULL,
  blurhash TEXT,
  original_filename_cipher TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_event ON media(event_id);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_cipher TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`
	],
	[
		'002_companion_invites.sql',
		`
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
`
	],
	[
		'003_companion_invite_names.sql',
		`
ALTER TABLE companion_invites ADD COLUMN companion_name_cipher TEXT;
`
	],
	[
		'004_companion_invite_tokens.sql',
		`
ALTER TABLE companion_invites ADD COLUMN token_cipher TEXT;
`
	],
	[
		'005_session_and_rate_limit.sql',
		`
-- Session idle timeout support and login throttling.
-- Existing migrations must never be modified, so this adds new columns/tables only.
ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;

-- Login brute-force protection, keyed by account (never by IP: all guests of one
-- school network share a single public IP behind NAT).
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_hash TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_account ON login_attempts(account_hash, attempted_at);
`
	],
	[
		'006_guest_rate_limit.sql',
		`
-- Abuse throttling for the public, unauthenticated guest paths (invitation page
-- actions: RSVP, wall posts, poll votes, upload session creation).
--
-- Keyed by a hash of the per-event device token, never by IP: every guest of one
-- school sits behind a single shared public IP, so a per-IP limit would lock out
-- the entire audience after a handful of legitimate actions. This is the same
-- reasoning as login_attempts in 005, applied to guests.
CREATE TABLE IF NOT EXISTS guest_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  device_token_hash TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guest_attempts_device
  ON guest_attempts(event_id, device_token_hash, attempted_at);
`
	],
	[
		'007_guest_attempt_budget.sql',
		`
-- Namespaces the guest throttle by budget.
--
-- 006 recorded wall posts, poll votes and upload sessions in one table with no
-- discriminator, so the two counters counted the same rows. A guest who spent their
-- legal upload budget also lost half of their wall-post budget, and 20 wall posts
-- blocked uploads although the upload allowance was untouched.
--
-- The budget tag is what makes the two allowances independent. Existing rows are
-- attributed to 'write', the default and widest budget, so an upgrade cannot hand
-- anyone a fresh allowance mid-window.
--
-- Existing migrations are never modified, so this is additive and works both on a
-- fresh install (006 then 007) and on a database that already ran 006.
ALTER TABLE guest_attempts ADD COLUMN budget TEXT NOT NULL DEFAULT 'write';

CREATE INDEX IF NOT EXISTS idx_guest_attempts_budget
  ON guest_attempts(event_id, device_token_hash, budget, attempted_at);
`
	],
	[
		'008_event_announcements.sql',
		`
-- Host announcements to the guests who confirmed ("bring drinks by Friday").
--
-- Content is encrypted with the event key like every other guest-visible payload, so
-- an announcement is not readable from the database file alone - consistent with the
-- project's privacy claim rather than being an exception to it.
--
-- The audience column is stored so the intent survives even if the RSVP of a guest
-- changes later: a message sent to the yeses stays with the yeses that existed at
-- send time.
CREATE TABLE IF NOT EXISTS event_announcements (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  content_cipher TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'yes',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_announcements_event
  ON event_announcements(event_id, created_at);
`
	],
	[
		'009_potluck_and_playlist.sql',
		`
-- Mitbringliste (Potluck items) and Music playlist link.
--
-- Potluck titles and claim names are encrypted with the event key.
-- A host or guest can add items. Attending guests can claim or unclaim items.
--
-- Events table is extended with playlist_url_cipher and invite_token_cipher.
-- Storing the invite token encrypted with the event key allows the host to display
-- the QR code at any time (e.g. for Party Mode on the bar/music PC) without
-- storing plaintext tokens in SQLite.
ALTER TABLE events ADD COLUMN playlist_url_cipher TEXT;
ALTER TABLE events ADD COLUMN invite_token_cipher TEXT;

CREATE TABLE IF NOT EXISTS potluck_items (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  creator_guest_id TEXT REFERENCES guests(id) ON DELETE SET NULL,
  title_cipher TEXT NOT NULL,
  claimed_by_guest_id TEXT REFERENCES guests(id) ON DELETE SET NULL,
  claimed_by_name_cipher TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_potluck_items_event
  ON potluck_items(event_id, created_at);
`
	],
	[
		'010_event_feature_flags.sql',
		`
-- Feature toggles for events (Pinnwand, Umfragen, Mitbringliste, Galerie).
-- Allows hosts to disable specific tabs on the guest invitation page.
ALTER TABLE events ADD COLUMN show_wall INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN show_polls INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN show_potluck INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN show_gallery INTEGER NOT NULL DEFAULT 1;
`
	],
	[
		'011_event_show_playlist.sql',
		`
-- Feature toggle for playlist tab.
-- Allows hosts to disable the playlist tab on the guest invitation page.
ALTER TABLE events ADD COLUMN show_playlist INTEGER NOT NULL DEFAULT 1;
`
	]
];

export function runMigrations(): { applied: string[] } {
	const db = getDb();

	// Create migrations tracker table if not exists
	db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

	const appliedRows = db.prepare('SELECT name FROM _migrations').all() as { name: string }[];
	const appliedSet = new Set(appliedRows.map((r) => r.name));

	const newlyApplied: string[] = [];

	for (const [name, sql] of MIGRATIONS) {
		if (!appliedSet.has(name)) {
			const applyTx = db.transaction(() => {
				db.exec(sql);
				db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
					name,
					Date.now()
				);
			});

			applyTx();
			newlyApplied.push(name);
			console.log(`Applied migration: ${name}`);
		}
	}

	return { applied: newlyApplied };
}
