import crypto from 'node:crypto';
import { getDb } from '../client';
import { getEventKey, encryptText, decryptText } from '../../crypto';

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
