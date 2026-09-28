import crypto from 'node:crypto';
import { getDb } from '../client';
import { decryptText, encryptText, getEventKey } from '../../crypto';

function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

export interface CompanionInviteItem {
	id: string;
	name: string;
	token: string | null;
	isClaimed: boolean;
}

export function createCompanionInvite(
	eventId: string,
	ownerGuestId: string,
	companionName: string
): string {
	const id = crypto.randomUUID();
	const token = crypto.randomBytes(24).toString('base64url');
	const eventKey = getEventKey(eventId);
	const nameCipher = encryptText(companionName.trim(), eventKey, `companion_invites:${id}:name`);
	const tokenCipher = encryptText(token, eventKey, `companion_invites:${id}:token`);
	getDb()
		.prepare(
			`INSERT INTO companion_invites (id, event_id, owner_guest_id, token_hash, token_cipher, companion_name_cipher, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(id, eventId, ownerGuestId, hashToken(token), tokenCipher, nameCipher, Date.now());
	return token;
}

export function getOrCreateCompanionInvite(
	eventId: string,
	ownerGuestId: string,
	companionName: string
): string {
	const db = getDb();
	const eventKey = getEventKey(eventId);

	const rows = db
		.prepare(
			`SELECT id, token_hash, token_cipher, companion_name_cipher, claimed_by_guest_id 
    FROM companion_invites WHERE event_id = ? AND owner_guest_id = ? ORDER BY created_at DESC`
		)
		.all(eventId, ownerGuestId) as {
		id: string;
		token_hash: string;
		token_cipher: string | null;
		companion_name_cipher: string | null;
		claimed_by_guest_id: string | null;
	}[];

	for (const row of rows) {
		if (row.token_cipher) {
			try {
				const token = decryptText(row.token_cipher, eventKey, `companion_invites:${row.id}:token`);
				if (token) return token;
			} catch (err) {
				console.warn('Failed to decrypt token for companion invite', row.id, err);
			}
		}
	}

	if (rows.length > 0 && !rows[0].claimed_by_guest_id) {
		const existing = rows[0];
		const token = crypto.randomBytes(24).toString('base64url');
		const tokenCipher = encryptText(token, eventKey, `companion_invites:${existing.id}:token`);
		const nameCipher = companionName.trim()
			? encryptText(companionName.trim(), eventKey, `companion_invites:${existing.id}:name`)
			: existing.companion_name_cipher;
		db.prepare(
			`UPDATE companion_invites SET token_hash = ?, token_cipher = ?, companion_name_cipher = ? WHERE id = ?`
		).run(hashToken(token), tokenCipher, nameCipher, existing.id);
		return token;
	}

	return createCompanionInvite(eventId, ownerGuestId, companionName);
}

export function listCompanionInvitesForOwner(
	eventId: string,
	ownerGuestId: string
): CompanionInviteItem[] {
	const db = getDb();
	const eventKey = getEventKey(eventId);
	const rows = db
		.prepare(
			`SELECT id, companion_name_cipher, token_cipher, claimed_by_guest_id 
    FROM companion_invites WHERE event_id = ? AND owner_guest_id = ? ORDER BY created_at ASC`
		)
		.all(eventId, ownerGuestId) as {
		id: string;
		companion_name_cipher: string | null;
		token_cipher: string | null;
		claimed_by_guest_id: string | null;
	}[];

	return rows.map((row) => {
		let name = '';
		if (row.companion_name_cipher) {
			try {
				name = decryptText(row.companion_name_cipher, eventKey, `companion_invites:${row.id}:name`);
			} catch {
				name = '';
			}
		}
		let token: string | null = null;
		if (row.token_cipher) {
			try {
				token = decryptText(row.token_cipher, eventKey, `companion_invites:${row.id}:token`);
			} catch {
				token = null;
			}
		}
		return {
			id: row.id,
			name,
			token,
			isClaimed: !!row.claimed_by_guest_id
		};
	});
}

export function countCompanionInvites(eventId: string, ownerGuestId: string): number {
	const row = getDb()
		.prepare(
			'SELECT COUNT(*) as count FROM companion_invites WHERE event_id = ? AND owner_guest_id = ?'
		)
		.get(eventId, ownerGuestId) as { count: number };
	return row.count;
}

export function claimCompanionInvite(eventId: string, token: string, guestId: string): boolean {
	const result = getDb()
		.prepare(
			`UPDATE companion_invites SET claimed_by_guest_id = ?
      WHERE event_id = ? AND token_hash = ? AND claimed_by_guest_id IS NULL`
		)
		.run(guestId, eventId, hashToken(token));
	return result.changes === 1;
}

export function findAvailableCompanionInvite(
	eventId: string,
	token: string
): { id: string; name: string } | null {
	const row = getDb()
		.prepare(
			`SELECT id, companion_name_cipher FROM companion_invites
        WHERE event_id = ? AND token_hash = ? AND claimed_by_guest_id IS NULL`
		)
		.get(eventId, hashToken(token)) as
		{ id: string; companion_name_cipher: string | null } | undefined;
	if (!row?.companion_name_cipher) return null;
	return {
		id: row.id,
		name: decryptText(
			row.companion_name_cipher,
			getEventKey(eventId),
			`companion_invites:${row.id}:name`
		)
	};
}

export function listCompanionNamesByOwner(eventId: string): Map<string, string[]> {
	const eventKey = getEventKey(eventId);
	const rows = getDb()
		.prepare(
			'SELECT id, owner_guest_id, companion_name_cipher FROM companion_invites WHERE event_id = ?'
		)
		.all(eventId) as { id: string; owner_guest_id: string; companion_name_cipher: string | null }[];
	const namesByOwner = new Map<string, string[]>();
	for (const row of rows) {
		if (!row.companion_name_cipher) continue;
		const name = decryptText(
			row.companion_name_cipher,
			eventKey,
			`companion_invites:${row.id}:name`
		);
		namesByOwner.set(row.owner_guest_id, [...(namesByOwner.get(row.owner_guest_id) || []), name]);
	}
	return namesByOwner;
}
