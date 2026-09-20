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
    db.prepare(`
      INSERT INTO polls (
        id, event_id, question_cipher, is_multiple, allow_guest_options, is_anonymous, deadline, is_closed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
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
): PollOptionData {
  const db = getDb();
  const ek = getEventKey(eventId);
  const optId = crypto.randomUUID();
  const textCipher = encryptText(text.trim(), ek, `poll_options:${optId}:text`);

  const maxOrderRow = db.prepare('SELECT MAX(sort_order) as m FROM poll_options WHERE poll_id = ?').get(pollId) as { m: number };
  const sortOrder = (maxOrderRow?.m ?? 0) + 1;

  db.prepare(`
    INSERT INTO poll_options (id, poll_id, created_by_guest_id, text_cipher, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(optId, pollId, guestId || null, textCipher, sortOrder);

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
  optionIds: string[]
): boolean {
  const db = getDb();
  const poll = db.prepare('SELECT is_multiple, is_closed, deadline FROM polls WHERE id = ?').get(pollId) as any;
  if (!poll || poll.is_closed) return false;

  if (poll.deadline && new Date(poll.deadline).getTime() < Date.now()) {
    return false;
  }

  const tx = db.transaction(() => {
    // 1. Remove previous votes by this guest for this poll
    db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND guest_id = ?').run(pollId, guestId);

    // 2. Insert new votes
    const targetOptionIds = poll.is_multiple ? optionIds : optionIds.slice(0, 1);
    const insertVote = db.prepare(`
      INSERT INTO poll_votes (id, poll_id, option_id, guest_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const optId of targetOptionIds) {
      insertVote.run(crypto.randomUUID(), pollId, optId, guestId, Date.now());
    }
  });

  tx();
  return true;
}

export function listPollsForEvent(eventId: string, currentGuestId?: string): PollData[] {
  const db = getDb();
  const ek = getEventKey(eventId);

  const pollRows = db.prepare('SELECT * FROM polls WHERE event_id = ? ORDER BY created_at DESC').all(eventId) as any[];

  return pollRows.map((p) => {
    const question = decryptText(p.question_cipher, ek, `polls:${p.id}:question`);

    const optRows = db.prepare(`
      SELECT o.id, o.poll_id, o.text_cipher,
        (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) as vote_count,
        (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id AND v.guest_id = ?) as user_voted
      FROM poll_options o
      WHERE o.poll_id = ?
      ORDER BY o.sort_order ASC
    `).all(currentGuestId || '', p.id) as any[];

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
  const row = db.prepare('SELECT is_closed FROM polls WHERE id = ? AND event_id = ?').get(pollId, eventId) as { is_closed: number } | undefined;
  if (!row) return false;

  const next = row.is_closed ? 0 : 1;
  db.prepare('UPDATE polls SET is_closed = ? WHERE id = ?').run(next, pollId);
  return true;
}