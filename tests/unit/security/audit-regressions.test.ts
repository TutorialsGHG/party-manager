import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '../../../src/lib/server/db/client';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import { createEvent } from '../../../src/lib/server/db/repositories/event.repository';
import { registerGuest } from '../../../src/lib/server/db/repositories/guest.repository';
import { MediaRepository } from '../../../src/lib/server/db/repositories/media.repository';
import {
	createPoll,
	addPollOption,
	votePoll,
	listPollsForEvent,
	isPollInEvent
} from '../../../src/lib/server/db/repositories/poll.repository';
import { createUser } from '../../../src/lib/server/db/repositories/user.repository';
import { hashPassword } from '../../../src/lib/server/auth/password';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery';
import { isHttpsBaseUrl, sessionCookieName } from '../../../src/lib/server/auth/session';
import {
	checkLoginRateLimit,
	recordLoginFailure,
	clearLoginFailures,
	LOGIN_MAX_FAILURES
} from '../../../src/lib/server/auth/rate-limit';
import { createPoWChallenge, verifyPoWSolution } from '../../../src/lib/server/auth/pow';

/**
 * Regression tests for the security audit findings.
 *
 * DB-01  Guest of event B must not be able to vote in or extend a poll of event A.
 * DYN-01 Login throttling is enforced per account.
 * DYN-06 A proof-of-work solution may be redeemed only once.
 * DYN-07 A non-hex PoW signature must return false, never throw.
 * DYN-09 The session cookie name and its Secure flag must derive from the same
 *        source of truth, or a `__Host-` cookie is emitted without Secure and the
 *        browser silently discards it (every login fails).
 * DYN-10 The per-event storage quota must not be exhaustible by opening upload
 *        sessions that are never completed.
 */
describe('Security Audit Regression Tests', () => {
	let eventAId = '';
	let eventBId = '';
	let guestAId = '';
	let guestBId = '';
	let pollAId = '';

	beforeAll(async () => {
		runMigrations();
		const pwdHash = await hashPassword('HostPassword123!');
		const codes = generateRecoveryCodes(10).map((c) => c.codeHash);

		const hostA = createUser(`sec-a-${Date.now()}@party.local`, pwdHash, codes).user;
		const hostB = createUser(`sec-b-${Date.now()}@party.local`, pwdHash, codes).user;

		eventAId = createEvent(hostA.id, {
			title: 'Event A',
			dateStart: '2026-08-15T18:00:00.000Z'
		}).id;
		eventBId = createEvent(hostB.id, {
			title: 'Event B',
			dateStart: '2026-08-16T18:00:00.000Z'
		}).id;

		guestAId = registerGuest(eventAId, 'tok-sec-a', 'Gast A').id;
		guestBId = registerGuest(eventBId, 'tok-sec-b', 'Gast B').id;

		pollAId = createPoll(eventAId, {
			question: 'Welche Musik?',
			options: ['Pop', 'Rock'],
			allowGuestOptions: true
		}).id;
	});

	describe('DB-01: poll IDOR between events', () => {
		it('reports which polls belong to which event', () => {
			expect(isPollInEvent(pollAId, eventAId)).toBe(true);
			expect(isPollInEvent(pollAId, eventBId)).toBe(false);
			expect(isPollInEvent('does-not-exist', eventAId)).toBe(false);
			expect(isPollInEvent('', eventAId)).toBe(false);
		});

		it('refuses to add an option to a poll of another event', () => {
			const before = listPollsForEvent(eventAId).find((p) => p.id === pollAId)!;
			const optionCountBefore = before.options.length;

			// Guest of event B tries to extend a poll belonging to event A.
			expect(addPollOption(pollAId, eventBId, 'Injected', guestBId)).toBeNull();

			const after = listPollsForEvent(eventAId).find((p) => p.id === pollAId)!;
			expect(after.options.length).toBe(optionCountBefore);
		});

		it('still lets a guest of the own event add an option', () => {
			const before = listPollsForEvent(eventAId).find((p) => p.id === pollAId)!;
			const opt = addPollOption(pollAId, eventAId, 'Hip-Hop', guestAId);
			expect(opt).not.toBeNull();

			const after = listPollsForEvent(eventAId).find((p) => p.id === pollAId)!;
			expect(after.options.length).toBe(before.options.length + 1);
		});

		it('refuses a vote from a guest of another event', () => {
			const pollBefore = listPollsForEvent(eventAId).find((p) => p.id === pollAId)!;
			const targetOption = pollBefore.options[0].id;
			const votesBefore = pollBefore.totalVotes;

			const success = votePoll(pollAId, guestBId, [targetOption], eventAId);
			expect(success).toBe(false);

			const pollAfter = listPollsForEvent(eventAId).find((p) => p.id === pollAId)!;
			expect(pollAfter.totalVotes).toBe(votesBefore);
		});

		it('counts a vote from a guest of the own event', () => {
			const pollBefore = listPollsForEvent(eventAId).find((p) => p.id === pollAId)!;
			const targetOption = pollBefore.options[0].id;

			const success = votePoll(pollAId, guestAId, [targetOption], eventAId);
			expect(success).toBe(true);

			const pollAfter = listPollsForEvent(eventAId).find((p) => p.id === pollAId)!;
			expect(pollAfter.totalVotes).toBe(pollBefore.totalVotes + 1);
		});

		it('ignores option ids that belong to a different poll', () => {
			const foreignPoll = createPoll(eventAId, {
				question: 'Andere Umfrage',
				options: ['A', 'B']
			});
			const foreignOption = listPollsForEvent(eventAId).find((p) => p.id === foreignPoll.id)!
				.options[0].id;

			// Use a second guest of event A so this poll has no votes from earlier tests.
			const cleanGuest = registerGuest(eventAId, `tok-sec-clean-${Date.now()}`, 'Gast C');
			const targetPoll = listPollsForEvent(eventAId).find((p) => p.id === pollAId)!;
			const targetOption = targetPoll.options[0].id;

			// The guest votes for its own poll but smuggles a foreign option id.
			votePoll(pollAId, cleanGuest.id, [targetOption, foreignOption], eventAId);

			const after = listPollsForEvent(eventAId).find((p) => p.id === pollAId)!;
			// The target option gained exactly one vote; the foreign option id was discarded.
			expect(after.options.find((o) => o.id === targetOption)!.voteCount).toBe(
				targetPoll.options.find((o) => o.id === targetOption)!.voteCount + 1
			);
			expect(after.options.find((o) => o.id === foreignOption)).toBeUndefined();

			const foreignAfter = listPollsForEvent(eventAId).find((p) => p.id === foreignPoll.id)!;
			expect(foreignAfter.options.find((o) => o.id === foreignOption)!.voteCount).toBe(0);
		});
	});

	describe('DYN-01: login rate limiting per account', () => {
		beforeEach(() => {
			clearLoginFailures('throttle-test@party.local');
		});

		it('blocks the account after the configured number of failures', () => {
			for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
				recordLoginFailure('throttle-test@party.local');
			}
			const status = checkLoginRateLimit('throttle-test@party.local');
			expect(status.blocked).toBe(true);
			expect(status.retryAfterSeconds).toBeGreaterThan(0);
		});

		it('does not block a different account (no shared NAT counter)', () => {
			for (let i = 0; i < LOGIN_MAX_FAILURES + 3; i++) {
				recordLoginFailure('throttle-test@party.local');
			}
			expect(checkLoginRateLimit('other-guest@party.local').blocked).toBe(false);
		});

		it('clears the counter after a successful login', () => {
			for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
				recordLoginFailure('throttle-test@party.local');
			}
			clearLoginFailures('throttle-test@party.local');
			expect(checkLoginRateLimit('throttle-test@party.local').blocked).toBe(false);
		});

		it('never stores the raw e-mail address in the throttle table', () => {
			recordLoginFailure('plaintext-canary@party.local');
			const rows = getDb().prepare('SELECT account_hash FROM login_attempts').all() as {
				account_hash: string;
			}[];
			expect(rows.length).toBeGreaterThan(0);
			expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.account_hash))).toBe(true);
		});
	});

	describe('AUTH-05/DYN-06/DYN-07: proof of work', () => {
		function solveChallenge(challenge: string, prefix: string): string {
			for (let nonce = 0; nonce < 5_000_000; nonce++) {
				const candidate = String(nonce);
				const hash = createHash('sha256').update(`${challenge}${candidate}`).digest('hex');
				if (hash.startsWith(prefix)) return candidate;
			}
			throw new Error('no solution found');
		}

		it('accepts a valid solution exactly once', () => {
			const challenge = createPoWChallenge(2);
			const solution = solveChallenge(challenge.challenge, '00');

			expect(
				verifyPoWSolution(
					challenge.challenge,
					solution,
					challenge.difficulty,
					challenge.expiresAt,
					challenge.signature
				)
			).toBe(true);

			// Replay of the same solution must fail.
			expect(
				verifyPoWSolution(
					challenge.challenge,
					solution,
					challenge.difficulty,
					challenge.expiresAt,
					challenge.signature
				)
			).toBe(false);
		});

		it('rejects a non-hex signature without throwing', () => {
			const challenge = createPoWChallenge(2);
			expect(() =>
				verifyPoWSolution(
					challenge.challenge,
					'1',
					challenge.difficulty,
					challenge.expiresAt,
					'not-hex-at-all'
				)
			).not.toThrow();
			expect(
				verifyPoWSolution(
					challenge.challenge,
					'1',
					challenge.difficulty,
					challenge.expiresAt,
					'not-hex-at-all'
				)
			).toBe(false);
		});

		it('rejects a forged difficulty that was not signed by the server', () => {
			const challenge = createPoWChallenge(1);
			expect(
				verifyPoWSolution(challenge.challenge, '0', 0, challenge.expiresAt, challenge.signature)
			).toBe(false);
		});
	});

	describe('DYN-09: session cookie name and Secure flag agree', () => {
		it('detects the transport from the base URL', () => {
			expect(isHttpsBaseUrl('https://party.example.com')).toBe(true);
			expect(isHttpsBaseUrl('http://party.example.com')).toBe(false);
			expect(isHttpsBaseUrl('not-a-url')).toBe(false);
		});

		it('only uses the __Host- prefix when the transport is HTTPS', () => {
			// The prefix mandates Secure. Emitting it over plain HTTP makes the
			// browser discard the cookie, so every login fails silently.
			expect(sessionCookieName(true)).toBe('__Host-session');
			expect(sessionCookieName(false)).toBe('session');
		});

		it('never pairs the __Host- prefix with a non-secure transport', () => {
			// The invariant under test: name and flag come from one decision.
			// NODE_ENV must not influence the name at all - a bare-metal deploy
			// with NODE_ENV=production and an http BASE_URL used to produce
			// `__Host-session` without the mandatory Secure flag.
			for (const baseUrl of [
				'http://localhost:3000',
				'https://localhost:3000',
				'http://192.168.1.50:3000',
				'https://sub.domain.example'
			]) {
				const https = isHttpsBaseUrl(baseUrl);
				expect(sessionCookieName(https).startsWith('__Host-')).toBe(https);
			}
		});
	});

	describe('DYN-10: per-event storage quota', () => {
		function makePendingEvent(): { eventId: string; guestId: string } {
			const host = createUser(`quota-${Date.now()}-${Math.random()}@party.local`, 'x', []).user;
			const eventId = createEvent(host.id, {
				title: 'Quota Event',
				dateStart: '2026-09-01T18:00:00.000Z'
			}).id;
			const guestId = registerGuest(eventId, `tok-quota-${Math.random()}`, 'Quota Gast').id;
			return { eventId, guestId };
		}

		function addMedia(
			eventId: string,
			guestId: string,
			size: number,
			status: 'uploading' | 'ready' | 'failed'
		): string {
			const id = randomUUID();
			MediaRepository.createPendingMedia({
				id,
				eventId,
				uploaderGuestId: guestId,
				mimeType: 'image/jpeg',
				originalSize: size,
				originalFilename: `${id}.jpg`,
				fileKey: randomBytes(32),
				salt: randomBytes(8)
			});
			if (status !== 'uploading') {
				MediaRepository.updateStatus(id, status);
			}
			return id;
		}

		it('does not count abandoned uploading sessions against the quota', () => {
			const { eventId, guestId } = makePendingEvent();
			const MB = 1024 * 1024;

			addMedia(eventId, guestId, 4000 * MB, 'uploading');

			// A guest that opened sessions and never sent a byte must not be able
			// to reserve the event's whole quota.
			expect(MediaRepository.sumOriginalSizeByEvent(eventId)).toBe(0);
		});

		it('counts completed media against the quota', () => {
			const { eventId, guestId } = makePendingEvent();
			const MB = 1024 * 1024;

			addMedia(eventId, guestId, 10 * MB, 'ready');
			addMedia(eventId, guestId, 5 * MB, 'failed');

			expect(MediaRepository.sumOriginalSizeByEvent(eventId)).toBe(15 * MB);
		});

		it('still counts in-flight uploads so parallel sessions stay bounded', () => {
			const { eventId, guestId } = makePendingEvent();
			const MB = 1024 * 1024;

			addMedia(eventId, guestId, 10 * MB, 'uploading');
			addMedia(eventId, guestId, 20 * MB, 'ready');

			expect(MediaRepository.sumPendingSizeByEvent(eventId)).toBe(10 * MB);
			expect(MediaRepository.sumOriginalSizeByEvent(eventId)).toBe(20 * MB);
		});

		it('cleans up abandoned uploads older than the given age', () => {
			const { eventId, guestId } = makePendingEvent();

			const staleId = addMedia(eventId, guestId, 1, 'uploading');
			const freshId = addMedia(eventId, guestId, 1, 'uploading');

			// Backdate only the first row past the TTL.
			getDb()
				.prepare('UPDATE media SET created_at = ? WHERE id = ?')
				.run(Date.now() - 48 * 60 * 60 * 1000, staleId);

			const removed = MediaRepository.cleanupAbandonedUploads(24 * 60 * 60 * 1000);
			expect(removed).toBeGreaterThanOrEqual(1);

			const remaining = getDb()
				.prepare('SELECT id FROM media WHERE id IN (?, ?)')
				.all(staleId, freshId) as { id: string }[];
			expect(remaining.map((r) => r.id)).not.toContain(staleId);
			expect(remaining.map((r) => r.id)).toContain(freshId);
		});

		it('never removes completed media during cleanup', () => {
			const { eventId, guestId } = makePendingEvent();
			const readyId = addMedia(eventId, guestId, 1, 'ready');
			getDb()
				.prepare('UPDATE media SET created_at = ? WHERE id = ?')
				.run(Date.now() - 48 * 60 * 60 * 1000, readyId);

			MediaRepository.cleanupAbandonedUploads(24 * 60 * 60 * 1000);

			const row = getDb().prepare('SELECT id FROM media WHERE id = ?').get(readyId);
			expect(row).toBeDefined();
		});
	});
});
