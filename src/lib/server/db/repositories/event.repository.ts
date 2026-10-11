import crypto from 'node:crypto';
import { getDb } from '../client';
import {
	generateEventKey,
	getEventKey,
	encryptText,
	decryptText,
	shredEventKey
} from '../../crypto';

export interface EventData {
	id: string;
	token?: string; // only present upon creation or regeneration
	tokenHash: string;
	hostId: string;
	dateStart: string;
	dateEnd?: string | null;
	accentColor: string;
	title: string;
	description?: string;
	locationName?: string;
	locationAddress?: string;
	playlistUrl?: string;
	maxCompanions: number;
	showWall?: boolean;
	showPolls?: boolean;
	showPotluck?: boolean;
	showGallery?: boolean;
	createdAt: number;
}

export function generateInviteToken(): string {
	// 128-bit cryptographically secure URL-safe base64 string (~22 characters)
	return crypto.randomBytes(16).toString('base64url');
}

export function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

export function createEvent(
	hostId: string,
	params: {
		title: string;
		description?: string;
		dateStart: string;
		dateEnd?: string | null;
		locationName?: string;
		locationAddress?: string;
		accentColor?: string;
		playlistUrl?: string;
		maxCompanions?: number;
		showWall?: boolean;
		showPolls?: boolean;
		showPotluck?: boolean;
		showGallery?: boolean;
	}
): EventData {
	const db = getDb();
	const id = crypto.randomUUID();
	const token = generateInviteToken();
	const tokenHash = hashToken(token);
	const now = Date.now();
	const accentColor = params.accentColor || '#007AFF';

	// 1. Generate and persist wrapped Event Key (EK)
	const ek = generateEventKey(id);

	// 2. Encrypt sensitive fields with EK and column-specific AAD
	const titleCipher = encryptText(params.title, ek, `events:${id}:title`);
	const descCipher = params.description
		? encryptText(params.description, ek, `events:${id}:description`)
		: null;
	const locNameCipher = params.locationName
		? encryptText(params.locationName, ek, `events:${id}:location_name`)
		: null;
	const locAddrCipher = params.locationAddress
		? encryptText(params.locationAddress, ek, `events:${id}:location_address`)
		: null;
	const playlistCipher =
		params.playlistUrl && params.playlistUrl.trim()
			? encryptText(params.playlistUrl.trim(), ek, `events:${id}:playlist_url`)
			: null;
	const inviteTokenCipher = encryptText(token, ek, `events:${id}:token`);

	const showWall = params.showWall !== false;
	const showPolls = params.showPolls !== false;
	const showPotluck = params.showPotluck !== false;
	const showGallery = params.showGallery !== false;

	db.prepare(
		`
    INSERT INTO events (
      id, token_hash, host_id, date_start, date_end, accent_color,
      title_cipher, description_cipher, location_name_cipher, location_address_cipher,
      playlist_url_cipher, invite_token_cipher, max_companions, created_at,
      show_wall, show_polls, show_potluck, show_gallery
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
	).run(
		id,
		tokenHash,
		hostId,
		params.dateStart,
		params.dateEnd || null,
		accentColor,
		titleCipher,
		descCipher,
		locNameCipher,
		locAddrCipher,
		playlistCipher,
		inviteTokenCipher,
		Math.max(0, Math.min(20, params.maxCompanions || 0)),
		now,
		showWall ? 1 : 0,
		showPolls ? 1 : 0,
		showPotluck ? 1 : 0,
		showGallery ? 1 : 0
	);

	return {
		id,
		token,
		tokenHash,
		hostId,
		dateStart: params.dateStart,
		dateEnd: params.dateEnd,
		accentColor,
		title: params.title,
		description: params.description,
		locationName: params.locationName,
		locationAddress: params.locationAddress,
		playlistUrl: params.playlistUrl ? params.playlistUrl.trim() : undefined,
		maxCompanions: Math.max(0, Math.min(20, params.maxCompanions || 0)),
		showWall,
		showPolls,
		showPotluck,
		showGallery,
		createdAt: now
	};
}

function hydrateEventRow(row: any): EventData {
	const id = row.id;
	const ek = getEventKey(id);

	const title = decryptText(row.title_cipher, ek, `events:${id}:title`);
	const description = row.description_cipher
		? decryptText(row.description_cipher, ek, `events:${id}:description`)
		: '';
	const locationName = row.location_name_cipher
		? decryptText(row.location_name_cipher, ek, `events:${id}:location_name`)
		: '';
	const locationAddress = row.location_address_cipher
		? decryptText(row.location_address_cipher, ek, `events:${id}:location_address`)
		: '';
	const playlistUrl = row.playlist_url_cipher
		? decryptText(row.playlist_url_cipher, ek, `events:${id}:playlist_url`)
		: undefined;
	const token = row.invite_token_cipher
		? decryptText(row.invite_token_cipher, ek, `events:${id}:token`)
		: undefined;

	return {
		id,
		token,
		tokenHash: row.token_hash,
		hostId: row.host_id,
		dateStart: row.date_start,
		dateEnd: row.date_end,
		accentColor: row.accent_color,
		title,
		description,
		locationName,
		locationAddress,
		playlistUrl,
		maxCompanions: row.max_companions || 0,
		showWall: row.show_wall !== undefined && row.show_wall !== null ? Boolean(row.show_wall) : true,
		showPolls:
			row.show_polls !== undefined && row.show_polls !== null ? Boolean(row.show_polls) : true,
		showPotluck:
			row.show_potluck !== undefined && row.show_potluck !== null
				? Boolean(row.show_potluck)
				: true,
		showGallery:
			row.show_gallery !== undefined && row.show_gallery !== null
				? Boolean(row.show_gallery)
				: true,
		createdAt: row.created_at
	};
}

export function findEventById(eventId: string, hostId?: string): EventData | null {
	const db = getDb();
	const query = hostId
		? 'SELECT * FROM events WHERE id = ? AND host_id = ?'
		: 'SELECT * FROM events WHERE id = ?';
	const row = (
		hostId ? db.prepare(query).get(eventId, hostId) : db.prepare(query).get(eventId)
	) as any;

	if (!row) return null;
	return hydrateEventRow(row);
}

export function findEventByToken(token: string): EventData | null {
	const tokenHash = hashToken(token);
	const row = getDb().prepare('SELECT * FROM events WHERE token_hash = ?').get(tokenHash) as any;
	if (!row) return null;
	return hydrateEventRow(row);
}

export function listEventsForHost(hostId: string): EventData[] {
	const db = getDb();
	const rows = db
		.prepare('SELECT * FROM events WHERE host_id = ? ORDER BY date_start ASC')
		.all(hostId) as any[];
	return rows.map((r) => hydrateEventRow(r));
}

export function regenerateEventToken(eventId: string, hostId: string): string | null {
	const db = getDb();
	const token = generateInviteToken();
	const tokenHash = hashToken(token);
	const ek = getEventKey(eventId);
	const inviteTokenCipher = encryptText(token, ek, `events:${eventId}:token`);

	const res = db
		.prepare(
			'UPDATE events SET token_hash = ?, invite_token_cipher = ? WHERE id = ? AND host_id = ?'
		)
		.run(tokenHash, inviteTokenCipher, eventId, hostId);
	return res.changes > 0 ? token : null;
}

export function updatePlaylistUrl(
	eventId: string,
	hostId: string,
	playlistUrl: string | null
): boolean {
	const db = getDb();
	const ek = getEventKey(eventId);
	const cipher =
		playlistUrl && playlistUrl.trim()
			? encryptText(playlistUrl.trim(), ek, `events:${eventId}:playlist_url`)
			: null;
	const res = db
		.prepare('UPDATE events SET playlist_url_cipher = ? WHERE id = ? AND host_id = ?')
		.run(cipher, eventId, hostId);
	return res.changes > 0;
}

export function updateMaxCompanions(
	eventId: string,
	hostId: string,
	maxCompanions: number
): boolean {
	const result = getDb()
		.prepare('UPDATE events SET max_companions = ? WHERE id = ? AND host_id = ?')
		.run(Math.max(0, Math.min(20, maxCompanions)), eventId, hostId);
	return result.changes > 0;
}

export function updateEventFeatures(
	eventId: string,
	hostId: string,
	features: {
		showWall: boolean;
		showPolls: boolean;
		showPotluck: boolean;
		showGallery: boolean;
	}
): boolean {
	const result = getDb()
		.prepare(
			'UPDATE events SET show_wall = ?, show_polls = ?, show_potluck = ?, show_gallery = ? WHERE id = ? AND host_id = ?'
		)
		.run(
			features.showWall ? 1 : 0,
			features.showPolls ? 1 : 0,
			features.showPotluck ? 1 : 0,
			features.showGallery ? 1 : 0,
			eventId,
			hostId
		);
	return result.changes > 0;
}

export function deleteEvent(eventId: string, hostId: string): boolean {
	const db = getDb();

	// Verify ownership
	const row = db.prepare('SELECT id FROM events WHERE id = ? AND host_id = ?').get(eventId, hostId);
	if (!row) return false;

	// 1. Transactionally remove all rows from SQLite (cascades to guests, rsvps, polls, wall, media)
	const delTx = db.transaction(() => {
		db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
	});
	delTx();

	// 2. Crypto-Shredding: Irrevocably destroy the event key from disk & RAM!
	shredEventKey(eventId);

	// 3. Vacuum SQLite to clear free pages
	try {
		db.pragma('wal_checkpoint(TRUNCATE)');
	} catch {
		// Ignore checkpoint warnings
	}

	return true;
}
