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
	maxCompanions: number;
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
		maxCompanions?: number;
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

	db.prepare(
		`
    INSERT INTO events (
      id, token_hash, host_id, date_start, date_end, accent_color,
      title_cipher, description_cipher, location_name_cipher, location_address_cipher, max_companions, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
		Math.max(0, Math.min(20, params.maxCompanions || 0)),
		now
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
		maxCompanions: Math.max(0, Math.min(20, params.maxCompanions || 0)),
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

	return {
		id,
		tokenHash: row.token_hash,
		hostId: row.host_id,
		dateStart: row.date_start,
		dateEnd: row.date_end,
		accentColor: row.accent_color,
		title,
		description,
		locationName,
		locationAddress,
		maxCompanions: row.max_companions || 0,
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

	const res = db
		.prepare('UPDATE events SET token_hash = ? WHERE id = ? AND host_id = ?')
		.run(tokenHash, eventId, hostId);
	return res.changes > 0 ? token : null;
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
