import crypto from 'node:crypto';
import { getDb } from '../client';
import { getEventKey, encryptText, decryptText } from '../../crypto';
import { listCompanionNamesByOwner } from './companion-invite.repository';

export interface GuestData {
	id: string;
	eventId: string;
	name: string;
	isHost: boolean;
	isCompanion: boolean;
	createdAt: number;
}

export function hashDeviceToken(token: string): string {
	return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export function findGuestByDeviceToken(eventId: string, deviceToken: string): GuestData | null {
	const tokenHash = hashDeviceToken(deviceToken);
	const row = getDb()
		.prepare(
			`
    SELECT * FROM guests
    WHERE event_id = ? AND device_token_hash = ?
  `
		)
		.get(eventId, tokenHash) as any;

	if (!row) return null;

	const ek = getEventKey(eventId);
	const name = decryptText(row.name_cipher, ek, `guests:${row.id}:name`);

	return {
		id: row.id,
		eventId: row.event_id,
		name,
		isHost: !!row.is_host,
		isCompanion: !!row.companion_invite_id,
		createdAt: row.created_at
	};
}

export function findGuestById(guestId: string, eventId: string): GuestData | null {
	const row = getDb()
		.prepare('SELECT * FROM guests WHERE id = ? AND event_id = ?')
		.get(guestId, eventId) as any;
	if (!row) return null;

	const ek = getEventKey(eventId);
	const name = decryptText(row.name_cipher, ek, `guests:${row.id}:name`);

	return {
		id: row.id,
		eventId: row.event_id,
		name,
		isHost: !!row.is_host,
		isCompanion: !!row.companion_invite_id,
		createdAt: row.created_at
	};
}

export function registerGuest(
	eventId: string,
	deviceToken: string,
	name: string,
	isHost = false,
	companionInviteId?: string
): GuestData {
	const existing = findGuestByDeviceToken(eventId, deviceToken);
	const ek = getEventKey(eventId);

	if (existing) {
		// Update name
		const nameCipher = encryptText(name.trim(), ek, `guests:${existing.id}:name`);
		getDb().prepare('UPDATE guests SET name_cipher = ? WHERE id = ?').run(nameCipher, existing.id);
		return {
			...existing,
			name: name.trim()
		};
	}

	const id = crypto.randomUUID();
	const tokenHash = hashDeviceToken(deviceToken);
	const nameCipher = encryptText(name.trim(), ek, `guests:${id}:name`);
	const now = Date.now();

	getDb()
		.prepare(
			`
    INSERT INTO guests (id, event_id, device_token_hash, name_cipher, is_host, companion_invite_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
		)
		.run(id, eventId, tokenHash, nameCipher, isHost ? 1 : 0, companionInviteId || null, now);

	return {
		id,
		eventId,
		name: name.trim(),
		isHost,
		isCompanion: !!companionInviteId,
		createdAt: now
	};
}

export function listGuestsForEvent(eventId: string): GuestData[] {
	const rows = getDb()
		.prepare('SELECT * FROM guests WHERE event_id = ? ORDER BY created_at ASC')
		.all(eventId) as any[];
	const ek = getEventKey(eventId);

	return rows.map((r) => ({
		id: r.id,
		eventId: r.event_id,
		name: decryptText(r.name_cipher, ek, `guests:${r.id}:name`),
		isHost: !!r.is_host,
		isCompanion: !!r.companion_invite_id,
		createdAt: r.created_at
	}));
}

export function deleteGuest(guestId: string, eventId: string): boolean {
	const res = getDb()
		.prepare('DELETE FROM guests WHERE id = ? AND event_id = ?')
		.run(guestId, eventId);
	return res.changes > 0;
}

export interface GuestOverviewEntry {
	guestId: string;
	name: string;
	isHost: boolean;
	isCompanion: boolean;
	createdAt: number;
	status: 'yes' | 'maybe' | 'no' | null;
	companionCount: number;
	companionNames: string[];
	notes: string;
	wallPostCount: number;
	uploadCount: number;
}

/**
 * Every guest who ever opened the invitation for this event, with the activity the
 * host actually needs to answer "who is there?" - not only the guests who sent an
 * RSVP.
 *
 * `getRsvpSummary` only ever sees the `rsvps` table, so a guest who took a photo or
 * posted on the wall but never confirmed stays invisible to the host. That is the
 * whole point of this view: the union of the guests table and their activity.
 *
 * Counts come from grouped subqueries rather than per-guest queries so this stays a
 * single round-trip regardless of guest count.
 */
export function listGuestOverview(eventId: string): GuestOverviewEntry[] {
	const rows = getDb()
		.prepare(
			`
    SELECT g.id, g.name_cipher, g.is_host, g.companion_invite_id, g.created_at,
           r.id AS rsvp_id, r.status, r.companion_count, r.companion_names_cipher,
           r.notes_cipher,
           COALESCE(w.post_count, 0) AS post_count,
           COALESCE(m.upload_count, 0) AS upload_count
    FROM guests g
    LEFT JOIN rsvps r ON r.guest_id = g.id AND r.event_id = g.event_id
    LEFT JOIN (
      SELECT guest_id, COUNT(*) AS post_count
      FROM wall_posts
      WHERE event_id = ?
      GROUP BY guest_id
    ) w ON w.guest_id = g.id
    LEFT JOIN (
      SELECT uploader_guest_id, COUNT(*) AS upload_count
      FROM media
      WHERE event_id = ?
      GROUP BY uploader_guest_id
    ) m ON m.uploader_guest_id = g.id
    WHERE g.event_id = ?
    ORDER BY g.created_at ASC
  `
		)
		.all(eventId, eventId, eventId) as any[];

	const ek = getEventKey(eventId);

	// Companion names come from companion_invites, NOT from the comma-separated string
	// in rsvps.companion_names_cipher.
	//
	// Splitting that string is untrustworthy in both directions: a name containing a
	// comma ("Mueller, Anna") tears into two entries, and an empty slot yields fewer
	// names than there are companions. More importantly, getRsvpSummary() - rendered on
	// the SAME host page - already reads the names from companion_invites, so the two
	// views answered differently for identical data. Reading one source removes the
	// whole class of disagreement.
	const companionNamesByOwner = listCompanionNamesByOwner(eventId);

	return rows.map((row) => ({
		guestId: row.id,
		name: decryptText(row.name_cipher, ek, `guests:${row.id}:name`),
		isHost: !!row.is_host,
		isCompanion: !!row.companion_invite_id,
		createdAt: row.created_at,
		status: (row.status ?? null) as GuestOverviewEntry['status'],
		companionCount: row.companion_count ?? 0,
		companionNames: companionNamesByOwner.get(row.id) || [],
		// Same AAD rule as companion names: the RSVP row id, not the guest id.
		// `notes` is what a guest types into "Notizen oder Allergien" on the
		// invitation page - the host has to be able to read it, and there is no
		// other reader in the codebase.
		notes: row.notes_cipher
			? decryptText(row.notes_cipher, ek, `rsvps:${row.rsvp_id}:notes`).trim()
			: '',
		wallPostCount: row.post_count,
		uploadCount: row.upload_count
	}));
}
