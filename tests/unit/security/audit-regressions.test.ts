import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { getDb } from '../../../src/lib/server/db/client';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import { createEvent } from '../../../src/lib/server/db/repositories/event.repository';
import { registerGuest } from '../../../src/lib/server/db/repositories/guest.repository';
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
});
