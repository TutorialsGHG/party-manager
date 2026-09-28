import crypto from 'node:crypto';
import { getDb } from '../client';
import { getEventKey, encryptText, decryptText } from '../../crypto';
import { listCompanionNamesByOwner } from './companion-invite.repository';

export interface RsvpData {
	id: string;
	eventId: string;
	guestId: string;
	guestName?: string;
	status: 'yes' | 'maybe' | 'no';
	companionCount: number;
	companionNames?: string;
	notes?: string;
	updatedAt: number;
}

export interface RsvpSummary {
	yesCount: number;
	maybeCount: number;
	noCount: number;
	totalAttending: number; // yes + companions
	attendees: { guestId: string; name: string; companionCount: number; companionNames: string[] }[];
}

export function upsertRsvp(
	eventId: string,
	guestId: string,
	params: {
		status: 'yes' | 'maybe' | 'no';
		companionCount?: number;
		companionNames?: string;
		notes?: string;
	}
): RsvpData {
	const db = getDb();
	const ek = getEventKey(eventId);
	const now = Date.now();
	const companionCount = Math.max(0, params.companionCount || 0);

	const existing = db
		.prepare('SELECT id FROM rsvps WHERE event_id = ? AND guest_id = ?')
		.get(eventId, guestId) as { id: string } | undefined;
	const id = existing ? existing.id : crypto.randomUUID();

	const compNamesCipher = params.companionNames
		? encryptText(params.companionNames, ek, `rsvps:${id}:companion_names`)
		: null;
	const notesCipher = params.notes ? encryptText(params.notes, ek, `rsvps:${id}:notes`) : null;

	if (existing) {
		db.prepare(
			`
      UPDATE rsvps
      SET status = ?, companion_count = ?, companion_names_cipher = ?, notes_cipher = ?, updated_at = ?
      WHERE id = ?
    `
		).run(params.status, companionCount, compNamesCipher, notesCipher, now, id);
	} else {
		db.prepare(
			`
      INSERT INTO rsvps (id, event_id, guest_id, status, companion_count, companion_names_cipher, notes_cipher, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
		).run(id, eventId, guestId, params.status, companionCount, compNamesCipher, notesCipher, now);
	}

	return {
		id,
		eventId,
		guestId,
		status: params.status,
		companionCount,
		companionNames: params.companionNames,
		notes: params.notes,
		updatedAt: now
	};
}

export function findRsvpByGuestId(eventId: string, guestId: string): RsvpData | null {
	const row = getDb()
		.prepare('SELECT * FROM rsvps WHERE event_id = ? AND guest_id = ?')
		.get(eventId, guestId) as any;
	if (!row) return null;

	const ek = getEventKey(eventId);
	const companionNames = row.companion_names_cipher
		? decryptText(row.companion_names_cipher, ek, `rsvps:${row.id}:companion_names`)
		: '';
	const notes = row.notes_cipher ? decryptText(row.notes_cipher, ek, `rsvps:${row.id}:notes`) : '';

	return {
		id: row.id,
		eventId: row.event_id,
		guestId: row.guest_id,
		status: row.status,
		companionCount: row.companion_count,
		companionNames,
		notes,
		updatedAt: row.updated_at
	};
}

export function getRsvpSummary(eventId: string): RsvpSummary {
	const db = getDb();
	const rows = db
		.prepare(
			`
    SELECT r.id, r.guest_id, r.status, r.companion_count, g.name_cipher
    FROM rsvps r
    JOIN guests g ON r.guest_id = g.id
    WHERE r.event_id = ?
  `
		)
		.all(eventId) as any[];

	let yesCount = 0;
	let maybeCount = 0;
	let noCount = 0;
	let totalCompanions = 0;
	const attendees: {
		guestId: string;
		name: string;
		companionCount: number;
		companionNames: string[];
	}[] = [];

	const ek = getEventKey(eventId);
	const companionNamesByOwner = listCompanionNamesByOwner(eventId);

	for (const row of rows) {
		if (row.status === 'yes') {
			yesCount++;
			totalCompanions += row.companion_count;
			const guestName = decryptText(row.name_cipher, ek, `guests:${row.guest_id}:name`);
			attendees.push({
				guestId: row.guest_id,
				name: guestName,
				companionCount: row.companion_count,
				companionNames: companionNamesByOwner.get(row.guest_id) || []
			});
		} else if (row.status === 'maybe') {
			maybeCount++;
		} else if (row.status === 'no') {
			noCount++;
		}
	}

	return {
		yesCount,
		maybeCount,
		noCount,
		totalAttending: yesCount + totalCompanions,
		attendees
	};
}
