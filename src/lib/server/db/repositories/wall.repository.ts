import crypto from 'node:crypto';
import { getDb } from '../client';
import { getEventKey, encryptText, decryptText } from '../../crypto';

export interface WallPostData {
	id: string;
	eventId: string;
	guestId: string;
	authorName: string;
	content: string;
	isPinned: boolean;
	createdAt: number;
}

export function createWallPost(eventId: string, guestId: string, content: string): WallPostData {
	const db = getDb();
	const ek = getEventKey(eventId);
	const id = crypto.randomUUID();
	const now = Date.now();

	const contentCipher = encryptText(content.trim(), ek, `wall_posts:${id}:content`);

	db.prepare(
		`
    INSERT INTO wall_posts (id, event_id, guest_id, content_cipher, is_pinned, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `
	).run(id, eventId, guestId, contentCipher, now);

	// Get author name
	const guestRow = db.prepare('SELECT name_cipher FROM guests WHERE id = ?').get(guestId) as {
		name_cipher: string;
	};
	const authorName = guestRow
		? decryptText(guestRow.name_cipher, ek, `guests:${guestId}:name`)
		: 'Gast';

	return {
		id,
		eventId,
		guestId,
		authorName,
		content: content.trim(),
		isPinned: false,
		createdAt: now
	};
}

export function listWallPosts(eventId: string): WallPostData[] {
	const db = getDb();
	const ek = getEventKey(eventId);

	const rows = db
		.prepare(
			`
    SELECT w.id, w.event_id, w.guest_id, w.content_cipher, w.is_pinned, w.created_at, g.name_cipher
    FROM wall_posts w
    LEFT JOIN guests g ON w.guest_id = g.id
    WHERE w.event_id = ?
    ORDER BY w.is_pinned DESC, w.created_at DESC
  `
		)
		.all(eventId) as any[];

	return rows.map((r) => {
		const authorName = r.name_cipher
			? decryptText(r.name_cipher, ek, `guests:${r.guest_id}:name`)
			: 'Gast';
		const content = decryptText(r.content_cipher, ek, `wall_posts:${r.id}:content`);

		return {
			id: r.id,
			eventId: r.event_id,
			guestId: r.guest_id,
			authorName,
			content,
			isPinned: !!r.is_pinned,
			createdAt: r.created_at
		};
	});
}

export function togglePinWallPost(postId: string, eventId: string): boolean {
	const db = getDb();
	const row = db
		.prepare('SELECT is_pinned FROM wall_posts WHERE id = ? AND event_id = ?')
		.get(postId, eventId) as { is_pinned: number } | undefined;
	if (!row) return false;

	const nextState = row.is_pinned ? 0 : 1;
	db.prepare('UPDATE wall_posts SET is_pinned = ? WHERE id = ?').run(nextState, postId);
	return true;
}

export function deleteWallPost(
	postId: string,
	eventId: string,
	authorizedGuestId?: string
): boolean {
	const db = getDb();
	let query = 'DELETE FROM wall_posts WHERE id = ? AND event_id = ?';
	const params: any[] = [postId, eventId];

	if (authorizedGuestId) {
		// If deleted by guest, ensure they are the author
		query += ' AND guest_id = ?';
		params.push(authorizedGuestId);
	}

	const res = db.prepare(query).run(...params);
	return res.changes > 0;
}
