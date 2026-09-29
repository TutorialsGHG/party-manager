import crypto from 'node:crypto';
import { getDb } from '../client';
import { getEventKey, encryptText, decryptText } from '../../crypto';

export interface PollOptionData {
	id: string;
	pollId: string;
	text: string;
	voteCount: number;
	hasVoted?: boolean;
}

export interface PollData {
	id: string;
	eventId: string;
	question: string;
	isMultiple: boolean;
	allowGuestOptions: boolean;
	isAnonymous: boolean;
	deadline?: string | null;
	isClosed: boolean;
	totalVotes: number;
	options: PollOptionData[];
	createdAt: number;
}

export function createPoll(
	eventId: string,
	params: {
		question: string;
		options: string[];
		isMultiple?: boolean;
		allowGuestOptions?: boolean;
		isAnonymous?: boolean;
		deadline?: string | null;
	}
): PollData {
	const db = getDb();
	const ek = getEventKey(eventId);
	const pollId = crypto.randomUUID();
	const now = Date.now();

	const questionCipher = encryptText(params.question.trim(), ek, `polls:${pollId}:question`);

	const tx = db.transaction(() => {
		db.prepare(
			`
      INSERT INTO polls (
        id, event_id, question_cipher, is_multiple, allow_guest_options, is_anonymous, deadline, is_closed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `
		).run(
			pollId,
			eventId,
			questionCipher,
			params.isMultiple ? 1 : 0,
			params.allowGuestOptions ? 1 : 0,
			params.isAnonymous ? 1 : 0,
			params.deadline || null,
			now
		);

		const insertOpt = db.prepare(`
      INSERT INTO poll_options (id, poll_id, text_cipher, sort_order)
      VALUES (?, ?, ?, ?)
    `);

		let order = 0;
		for (const optText of params.options) {
			if (!optText.trim()) continue;
			const optId = crypto.randomUUID();
			const textCipher = encryptText(optText.trim(), ek, `poll_options:${optId}:text`);
			insertOpt.run(optId, pollId, textCipher, order++);
		}
	});

	tx();

	return listPollsForEvent(eventId).find((p) => p.id === pollId)!;
}

export function addPollOption(
	pollId: string,
	eventId: string,
	text: string,
	guestId?: string
): PollOptionData | null {
	const db = getDb();

	// Enforce that the poll actually belongs to the caller's event.
	// Without this, a guest of event B could insert options into a poll of event A
	// (IDOR). Those options would be encrypted with B's event key and therefore
	// fail AES-GCM authentication when A's host loads the event -> permanent 500.
	// Returning null (instead of throwing) keeps a bypassed caller from turning a
	// rejected cross-event write into a 500 for the guest.
	const pollRow = db
		.prepare('SELECT id FROM polls WHERE id = ? AND event_id = ?')
		.get(pollId, eventId) as { id: string } | undefined;
	if (!pollRow) {
		return null;
	}

	const ek = getEventKey(eventId);
	const optId = crypto.randomUUID();
	const textCipher = encryptText(text.trim(), ek, `poll_options:${optId}:text`);

	const maxOrderRow = db
		.prepare('SELECT MAX(sort_order) as m FROM poll_options WHERE poll_id = ?')
		.get(pollId) as { m: number };
	const sortOrder = (maxOrderRow?.m ?? 0) + 1;

	db.prepare(
		`
    INSERT INTO poll_options (id, poll_id, created_by_guest_id, text_cipher, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `
	).run(optId, pollId, guestId || null, textCipher, sortOrder);

	return {
		id: optId,
		pollId,
		text: text.trim(),
		voteCount: 0,
		hasVoted: false
	};
}

export function votePoll(
	pollId: string,
	guestId: string,
	optionIds: string[],
	eventId?: string
): boolean {
	const db = getDb();

	// Enforce poll->event and guest->event binding. Without it a guest of event B
	// could vote in a poll of event A (IDOR) and corrupt A's host-side tally.
	const poll = db
		.prepare(
			`
      SELECT p.is_multiple, p.is_closed, p.deadline, p.event_id
      FROM polls p
      JOIN guests g ON g.id = ? AND g.event_id = p.event_id
      WHERE p.id = ?${eventId ? ' AND p.event_id = ?' : ''}
    `
		)
		.get(...(eventId ? [guestId, pollId, eventId] : [guestId, pollId])) as any;
	if (!poll || poll.is_closed) return false;

	if (poll.deadline && new Date(poll.deadline).getTime() < Date.now()) {
		return false;
	}

	const tx = db.transaction(() => {
		// Remove previous votes by this guest for this poll
		db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND guest_id = ?').run(pollId, guestId);

		// 2. Insert new votes (options must belong to this poll - prevents cross-poll vote injection)
		const targetOptionIds = poll.is_multiple ? optionIds : optionIds.slice(0, 1);
		const validOptionIds = new Set(
			(
				db.prepare('SELECT id FROM poll_options WHERE poll_id = ?').all(pollId) as { id: string }[]
			).map((o) => o.id)
		);
		const insertVote = db.prepare(`
      INSERT INTO poll_votes (id, poll_id, option_id, guest_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

		for (const optId of targetOptionIds) {
			if (!validOptionIds.has(optId)) continue;
			insertVote.run(crypto.randomUUID(), pollId, optId, guestId, Date.now());
		}
	});

	tx();
	return true;
}

/**
 * Returns true if the given poll belongs to the given event.
 * Used to enforce the tenant boundary before guest-supplied pollIds are used.
 */
export function isPollInEvent(pollId: string, eventId: string): boolean {
	if (!pollId || !eventId) return false;
	const row = getDb()
		.prepare('SELECT 1 AS ok FROM polls WHERE id = ? AND event_id = ?')
		.get(pollId, eventId) as { ok: number } | undefined;
	return !!row;
}

export function listPollsForEvent(eventId: string, currentGuestId?: string): PollData[] {
	const db = getDb();
	const ek = getEventKey(eventId);

	const pollRows = db
		.prepare('SELECT * FROM polls WHERE event_id = ? ORDER BY created_at DESC')
		.all(eventId) as any[];

	return pollRows.map((p) => {
		const question = decryptText(p.question_cipher, ek, `polls:${p.id}:question`);

		const optRows = db
			.prepare(
				`
      SELECT o.id, o.poll_id, o.text_cipher,
        (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) as vote_count,
        (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id AND v.guest_id = ?) as user_voted
      FROM poll_options o
      WHERE o.poll_id = ?
      ORDER BY o.sort_order ASC
    `
			)
			.all(currentGuestId || '', p.id) as any[];

		let totalVotes = 0;
		const options: PollOptionData[] = optRows.map((o) => {
			const voteCount = o.vote_count || 0;
			totalVotes += voteCount;
			return {
				id: o.id,
				pollId: o.poll_id,
				text: decryptText(o.text_cipher, ek, `poll_options:${o.id}:text`),
				voteCount,
				hasVoted: !!o.user_voted
			};
		});

		return {
			id: p.id,
			eventId: p.event_id,
			question,
			isMultiple: !!p.is_multiple,
			allowGuestOptions: !!p.allow_guest_options,
			isAnonymous: !!p.is_anonymous,
			deadline: p.deadline,
			isClosed: !!p.is_closed,
			totalVotes,
			options,
			createdAt: p.created_at
		};
	});
}

export function toggleClosePoll(pollId: string, eventId: string): boolean {
	const db = getDb();
	const row = db
		.prepare('SELECT is_closed FROM polls WHERE id = ? AND event_id = ?')
		.get(pollId, eventId) as { is_closed: number } | undefined;
	if (!row) return false;

	const next = row.is_closed ? 0 : 1;
	db.prepare('UPDATE polls SET is_closed = ? WHERE id = ?').run(next, pollId);
	return true;
}
