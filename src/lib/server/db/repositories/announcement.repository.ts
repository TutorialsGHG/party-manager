import crypto from 'node:crypto';
import { getDb } from '../client';
import { getEventKey, encryptText, decryptText } from '../../crypto';

/**
 * Host announcements: short messages sent to the guests of one event ("please bring
 * drinks by Friday").
 *
 * Deliberately modelled on the wall: an announcement is authored by the host's guest
 * row, encrypted with the event key, and broadcast over SSE. The difference is the
 * audience - an announcement reaches the guests who confirmed, not everyone who
 * happens to have the link open.
 */
export type AnnouncementAudience = 'yes';

export interface AnnouncementData {
	id: string;
	eventId: string;
	authorName: string;
	content: string;
	audience: AnnouncementAudience;
	createdAt: number;
}

export function createAnnouncement(
	eventId: string,
	authorGuestId: string,
	content: string,
	audience: AnnouncementAudience = 'yes'
): AnnouncementData {
	const db = getDb();
	const id = crypto.randomUUID();
	const now = Date.now();
	const eventKey = getEventKey(eventId);
	const contentCipher = encryptText(content.trim(), eventKey, `announcements:${id}:content`);
	const authorName = getAuthorName(eventId, authorGuestId);

	db.prepare(
		`
    INSERT INTO event_announcements (id, event_id, author_guest_id, content_cipher, audience, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
	).run(id, eventId, authorGuestId, contentCipher, audience, now);

	return {
		id,
		eventId,
		authorName,
		content: content.trim(),
		audience,
		createdAt: now
	};
}

export function listAnnouncements(eventId: string): AnnouncementData[] {
	const rows = getDb()
		.prepare(
			`
    SELECT a.id, a.content_cipher, a.audience, a.created_at, a.author_guest_id,
           g.name_cipher AS author_name_cipher
    FROM event_announcements a
    LEFT JOIN guests g ON g.id = a.author_guest_id
    WHERE a.event_id = ?
    ORDER BY a.created_at DESC
  `
		)
		.all(eventId) as any[];

	const eventKey = getEventKey(eventId);

	return rows.map((r) => ({
		id: r.id,
		eventId,
		authorName: r.author_name_cipher
			? decryptText(r.author_name_cipher, eventKey, `guests:${r.author_guest_id}:name`)
			: 'Host',
		content: decryptText(r.content_cipher, eventKey, `announcements:${r.id}:content`),
		audience: r.audience as AnnouncementAudience,
		createdAt: r.created_at
	}));
}

export function deleteAnnouncement(announcementId: string, eventId: string): boolean {
	const res = getDb()
		.prepare('DELETE FROM event_announcements WHERE id = ? AND event_id = ?')
		.run(announcementId, eventId);
	return res.changes > 0;
}

function getAuthorName(eventId: string, guestId: string): string {
	const row = getDb()
		.prepare('SELECT name_cipher FROM guests WHERE id = ? AND event_id = ?')
		.get(guestId, eventId) as { name_cipher?: string } | undefined;
	if (!row?.name_cipher) return 'Host';
	return decryptText(row.name_cipher, getEventKey(eventId), `guests:${guestId}:name`);
}
