import crypto from 'node:crypto';
import { getDb } from '../client';
import { getEventKey, encryptText, decryptText } from '../../crypto';

export interface PotluckItemData {
	id: string;
	eventId: string;
	title: string;
	creatorGuestId?: string | null;
	claimedByGuestId?: string | null;
	claimedByName?: string | null;
	createdAt: number;
}

export function createPotluckItem(
	eventId: string,
	title: string,
	creatorGuestId?: string | null
): PotluckItemData {
	const db = getDb();
	const id = crypto.randomUUID();
	const now = Date.now();
	const ek = getEventKey(eventId);
	const titleCipher = encryptText(title.trim(), ek, `potluck:${id}:title`);

	db.prepare(
		`
		INSERT INTO potluck_items (id, event_id, creator_guest_id, title_cipher, claimed_by_guest_id, claimed_by_name_cipher, created_at)
		VALUES (?, ?, ?, ?, NULL, NULL, ?)
	`
	).run(id, eventId, creatorGuestId || null, titleCipher, now);

	return {
		id,
		eventId,
		title: title.trim(),
		creatorGuestId: creatorGuestId || null,
		claimedByGuestId: null,
		claimedByName: null,
		createdAt: now
	};
}

export function listPotluckItems(eventId: string): PotluckItemData[] {
	const db = getDb();
	const rows = db
		.prepare(
			`
		SELECT id, creator_guest_id, title_cipher, claimed_by_guest_id, claimed_by_name_cipher, created_at
		FROM potluck_items
		WHERE event_id = ?
		ORDER BY created_at ASC
	`
		)
		.all(eventId) as any[];

	const ek = getEventKey(eventId);

	return rows.map((r) => {
		const title = decryptText(r.title_cipher, ek, `potluck:${r.id}:title`);
		const claimedByName = r.claimed_by_name_cipher
			? decryptText(r.claimed_by_name_cipher, ek, `potluck:${r.id}:claim_name`)
			: null;

		return {
			id: r.id,
			eventId,
			title,
			creatorGuestId: r.creator_guest_id,
			claimedByGuestId: r.claimed_by_guest_id,
			claimedByName,
			createdAt: r.created_at
		};
	});
}

export function claimPotluckItem(
	eventId: string,
	itemId: string,
	guestId: string,
	claimantName: string
): PotluckItemData | null {
	const db = getDb();
	const ek = getEventKey(eventId);

	const item = db
		.prepare(
			'SELECT id, title_cipher, creator_guest_id, claimed_by_guest_id, created_at FROM potluck_items WHERE id = ? AND event_id = ?'
		)
		.get(itemId, eventId) as any;

	if (!item) return null;
	if (item.claimed_by_guest_id && item.claimed_by_guest_id !== guestId) {
		return null;
	}

	const claimCipher = encryptText(claimantName.trim(), ek, `potluck:${itemId}:claim_name`);

	db.prepare(
		`
		UPDATE potluck_items
		SET claimed_by_guest_id = ?, claimed_by_name_cipher = ?
		WHERE id = ? AND event_id = ?
	`
	).run(guestId, claimCipher, itemId, eventId);

	const title = decryptText(item.title_cipher, ek, `potluck:${itemId}:title`);

	return {
		id: itemId,
		eventId,
		title,
		creatorGuestId: item.creator_guest_id,
		claimedByGuestId: guestId,
		claimedByName: claimantName.trim(),
		createdAt: item.created_at
	};
}

export function unclaimPotluckItem(
	eventId: string,
	itemId: string,
	guestId?: string | null,
	isHost = false
): PotluckItemData | null {
	const db = getDb();
	const ek = getEventKey(eventId);

	const item = db
		.prepare(
			'SELECT id, title_cipher, creator_guest_id, claimed_by_guest_id, created_at FROM potluck_items WHERE id = ? AND event_id = ?'
		)
		.get(itemId, eventId) as any;

	if (!item) return null;

	if (!isHost && item.claimed_by_guest_id !== guestId) {
		return null;
	}

	db.prepare(
		`
		UPDATE potluck_items
		SET claimed_by_guest_id = NULL, claimed_by_name_cipher = NULL
		WHERE id = ? AND event_id = ?
	`
	).run(itemId, eventId);

	const title = decryptText(item.title_cipher, ek, `potluck:${itemId}:title`);

	return {
		id: itemId,
		eventId,
		title,
		creatorGuestId: item.creator_guest_id,
		claimedByGuestId: null,
		claimedByName: null,
		createdAt: item.created_at
	};
}

export function deletePotluckItem(
	eventId: string,
	itemId: string,
	guestId?: string | null,
	isHost = false
): boolean {
	const db = getDb();

	const item = db
		.prepare('SELECT creator_guest_id FROM potluck_items WHERE id = ? AND event_id = ?')
		.get(itemId, eventId) as any;

	if (!item) return false;

	if (!isHost && item.creator_guest_id !== guestId) {
		return false;
	}

	const res = db
		.prepare('DELETE FROM potluck_items WHERE id = ? AND event_id = ?')
		.run(itemId, eventId);

	return res.changes > 0;
}
