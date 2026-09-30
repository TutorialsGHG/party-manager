import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runMigrations } from '../../../src/lib/server/db/migrate.js';
import { getDb } from '../../../src/lib/server/db/client.js';
import {
	checkGuestRateLimit,
	recordGuestAttempt,
	GUEST_WRITE_MAX,
	GUEST_UPLOAD_MAX
} from '../../../src/lib/server/auth/guest-rate-limit.js';
import {
	checkRegisterRateLimit,
	recordRegisterAttempt,
	recordLoginFailure,
	checkRegisterIpRateLimit,
	recordRegisterIpAttempt,
	REGISTER_MAX,
	REGISTER_IP_MAX
} from '../../../src/lib/server/auth/rate-limit.js';

const REGISTER_ACTION_PATH = resolve(
	import.meta.dirname,
	'../../../src/routes/(auth)/register/+page.server.ts'
);

/**
 * Abuse throttling for the public guest paths and for registration (Tier 1).
 *
 * These tests exist because the guards were added on the reasoning that the app is
 * reachable and the guest routes were previously unthrottled. The property that
 * matters is the NAT-safety one: a throttle must count one device, never a shared
 * public IP, because every guest of a school sits behind the same address.
 */
describe('Abuse throttling (guest + registration)', () => {
	const EVENT = 'evt-rate-limit-test';
	const OTHER_EVENT = 'evt-rate-limit-other';
	const DEVICE = 'device-token-aaa';

	beforeAll(() => {
		runMigrations();
	});

	beforeEach(() => {
		getDb().prepare('DELETE FROM guest_attempts').run();
		getDb().prepare('DELETE FROM login_attempts').run();
	});

	describe('guest throttle', () => {
		it('allows actions below the limit', () => {
			for (let i = 0; i < GUEST_WRITE_MAX - 1; i++) {
				recordGuestAttempt(EVENT, DEVICE);
			}
			const status = checkGuestRateLimit(EVENT, DEVICE);
			expect(status.blocked).toBe(false);
			expect(status.remaining).toBe(1);
		});

		it('blocks once the limit is reached and reports a retry delay', () => {
			for (let i = 0; i < GUEST_WRITE_MAX; i++) {
				recordGuestAttempt(EVENT, DEVICE);
			}
			const status = checkGuestRateLimit(EVENT, DEVICE);
			expect(status.blocked).toBe(true);
			expect(status.remaining).toBe(0);
			expect(status.retryAfterSeconds).toBeGreaterThan(0);
		});

		it('does not consume the budget of a second device on the same event', () => {
			for (let i = 0; i < GUEST_WRITE_MAX; i++) {
				recordGuestAttempt(EVENT, DEVICE);
			}
			// The NAT case: a different guest behind the same public IP must be
			// unaffected by the offender above.
			const other = checkGuestRateLimit(EVENT, 'device-token-bbb');
			expect(other.blocked).toBe(false);
			expect(other.remaining).toBe(GUEST_WRITE_MAX);
		});

		it('scopes counters per event so one event cannot exhaust another', () => {
			for (let i = 0; i < GUEST_WRITE_MAX; i++) {
				recordGuestAttempt(EVENT, DEVICE);
			}
			expect(checkGuestRateLimit(EVENT, DEVICE).blocked).toBe(true);
			expect(checkGuestRateLimit(OTHER_EVENT, DEVICE).blocked).toBe(false);
		});

		it('supports a tighter, separate budget for uploads', () => {
			for (let i = 0; i < GUEST_UPLOAD_MAX; i++) {
				recordGuestAttempt(EVENT, DEVICE, 'upload');
			}
			expect(checkGuestRateLimit(EVENT, DEVICE, 'upload').blocked).toBe(true);
		});

		// --- Regression: the two budgets were NOT independent ---
		//
		// guest_attempts had no budget column, so both counters counted the same rows.
		// Spending the (smaller) upload allowance silently debited the write allowance
		// too. These two tests failed on the original implementation with concrete
		// numbers - 10 uploads left 10 of 20 posts, and 20 posts blocked uploads - and
		// they are the reason the table now namespaces rows by budget.
		it('spending the upload budget does not debit the write budget', () => {
			for (let i = 0; i < GUEST_UPLOAD_MAX; i++) {
				recordGuestAttempt(EVENT, DEVICE, 'upload');
			}
			// Zero wall posts so far, so the full write allowance must remain.
			expect(checkGuestRateLimit(EVENT, DEVICE, 'write').remaining).toBe(GUEST_WRITE_MAX);
		});

		it('spending the write budget does not block uploads', () => {
			for (let i = 0; i < GUEST_WRITE_MAX; i++) {
				recordGuestAttempt(EVENT, DEVICE, 'write');
			}
			// The upload allowance is untouched and must still be fully available.
			expect(checkGuestRateLimit(EVENT, DEVICE, 'upload').blocked).toBe(false);
			expect(checkGuestRateLimit(EVENT, DEVICE, 'upload').remaining).toBe(GUEST_UPLOAD_MAX);
		});

		it('treats a missing device token as blocked rather than unlimited', () => {
			// An absent identity must not read as an unlimited budget.
			expect(checkGuestRateLimit(EVENT, '').blocked).toBe(true);
		});
	});

	describe('registration throttle', () => {
		it('allows attempts below the limit', () => {
			for (let i = 0; i < REGISTER_MAX - 1; i++) {
				recordRegisterAttempt('newcomer@party.local');
			}
			expect(checkRegisterRateLimit('newcomer@party.local').blocked).toBe(false);
		});

		it('blocks once the limit is reached', () => {
			for (let i = 0; i < REGISTER_MAX; i++) {
				recordRegisterAttempt('newcomer@party.local');
			}
			expect(checkRegisterRateLimit('newcomer@party.local').blocked).toBe(true);
		});

		it('keeps registration and login counters in separate key spaces', () => {
			// Five registration failures must not consume the login budget: an
			// attacker creating throwaway accounts must not be able to lock the real
			// host out of their own login.
			for (let i = 0; i < REGISTER_MAX; i++) {
				recordRegisterAttempt('host@party.local');
			}
			expect(checkRegisterRateLimit('host@party.local').blocked).toBe(true);

			// Same account, login namespace: untouched.
			expect(checkLoginBudgetIsSeparate('host@party.local')).toBe(true);
		});

		it('does not throttle a different account', () => {
			for (let i = 0; i < REGISTER_MAX; i++) {
				recordRegisterAttempt('attacker@party.local');
			}
			expect(checkRegisterRateLimit('someone-else@party.local').blocked).toBe(false);
		});

		// --- Regression: the throttle did not count successful registrations ---
		//
		// The only recordRegisterAttempt() call sat inside the proof-of-work FAILURE
		// branch, so a client that solved the challenge correctly - which the PR's own
		// comment notes costs one SHA-256 loop - never incremented the counter while
		// creating one account per address. The counter was therefore decorative for
		// the case it existed to stop.
		//
		// Proven from the action source rather than by simulating the whole action: the
		// invariant is about WHERE the record call sits relative to the PoW gate, and a
		// source assertion is what actually pins it. A successful-registration
		// integration test would prove the same line exists, at higher cost.
		it('records an attempt for a registration that passes the proof-of-work', () => {
			const src = readFileSync(REGISTER_ACTION_PATH, 'utf-8');

			// Two distinct call sites are required: one inside the PoW-failure branch and
			// one for everything that got PAST the gate. Asserting a count (rather than a
			// position) is what makes this fail on the original code, which had only the
			// failure-branch call.
			const callSites = src.split('recordRegisterAttempt(email);').length - 1;
			expect(callSites).toBe(2);

			// The second call must sit after the PoW gate and before the outcome is known,
			// so a successful registration and a "mail already taken" both get counted.
			const firstCall = src.indexOf('recordRegisterAttempt(email);');
			const secondCall = src.indexOf('recordRegisterAttempt(email);', firstCall + 1);
			const outcomeCheck = src.indexOf('// 2. Check if email is already taken.');

			expect(secondCall).toBeGreaterThan(firstCall);
			expect(outcomeCheck).toBeGreaterThan(secondCall);

			// And it must not be nested back inside the failure branch: the PoW gate ends
			// before the second call, so it also runs for a valid proof.
			const powFailure = src.indexOf('if (!isPoWValid) {');
			const powFailureRecord = src.indexOf('recordRegisterAttempt(email);', powFailure);
			expect(powFailureRecord).toBe(firstCall);
		});

		// The per-account key only bounds abuse of ONE address, so an attacker rotating
		// throwaway addresses never trips it. The network ceiling is what bounds that.
		describe('network-wide ceiling', () => {
			it('bounds address rotation from a single network', () => {
				for (let i = 0; i < REGISTER_IP_MAX; i++) {
					// A different address every time: the per-account limit never trips.
					recordRegisterIpAttempt('10.0.0.1');
					expect(checkRegisterRateLimit(`throwaway-${i}@party.local`).blocked).toBe(false);
				}
				expect(checkRegisterIpRateLimit('10.0.0.1').blocked).toBe(true);
			});

			it('does not let one network consume another network budget', () => {
				for (let i = 0; i < REGISTER_IP_MAX; i++) {
					recordRegisterIpAttempt('10.0.0.1');
				}
				expect(checkRegisterIpRateLimit('10.0.0.2').blocked).toBe(false);
			});

			it('degrades to no ceiling when no client address is available', () => {
				// Behind a proxy with no ADDRESS_HEADER the address is unknown. It must
				// not block everyone; the per-account limit still applies in that case.
				expect(checkRegisterIpRateLimit(null).blocked).toBe(false);
			});
		});

		// Regression: pruneOldAttempts() is shared by the login and the registration
		// counter but used to hardcode LOGIN_WINDOW_MS (15 min). The prune therefore
		// deleted rows the 1 h registration window still had to count, so the documented
		// "5 per hour" limit actually acted as "5 per 15 minutes" - 4x the intended
		// allowance, and a retry message that understated the real wait by the same
		// factor. These tests pin the window itself, not just the counter.
		describe('registration window is honoured, not just the login window', () => {
			const regHash = (account: string) =>
				crypto
					.createHash('sha256')
					.update(`register:${account.trim().toLowerCase()}`)
					.digest('hex');

			const seedAges = (account: string, agesMin: number[]) => {
				const now = Date.now();
				for (const age of agesMin) {
					getDb()
						.prepare('INSERT INTO login_attempts (account_hash, attempted_at) VALUES (?, ?)')
						.run(regHash(account), now - age * 60 * 1000);
				}
			};

			it('still blocks for attempts that are 4-20 minutes old', () => {
				// Inside both the 1 h registration window and, before the fix, pruned
				// away by the 15 min login window. This is the exact case that slipped through.
				seedAges('window-a@party.local', [4, 8, 12, 16, 20]);
				expect(checkRegisterRateLimit('window-a@party.local').blocked).toBe(true);
			});

			it('still blocks for attempts 18-50 minutes old', () => {
				// The whole 15-60 min band, i.e. the range the old prune silently cleared.
				seedAges('window-b@party.local', [18, 26, 34, 42, 50]);
				expect(checkRegisterRateLimit('window-b@party.local').blocked).toBe(true);
			});

			it('reports a retry delay consistent with the 1 h window', () => {
				seedAges('window-c@party.local', [1, 2, 3, 4, 5]);
				const status = checkRegisterRateLimit('window-c@party.local');
				expect(status.blocked).toBe(true);
				// A 1 h window measured from the newest attempt cannot be exhausted in
				// under ~55 min; the old 15 min window reported ~10 min here.
				expect(status.retryAfterSeconds).toBeGreaterThan(50 * 60);
			});

			it('releases the budget once attempts are older than the 1 h window', () => {
				// Proves the fix did not simply widen the window without bound.
				seedAges('window-d@party.local', [66, 70, 74, 78, 82]);
				expect(checkRegisterRateLimit('window-d@party.local').blocked).toBe(false);
			});

			it('does not let the login prune sweep delete registration rows', () => {
				// The opportunistic global DELETE in recordLoginFailure spans all
				// namespaces; with the 15 min bound it also purged register rows.
				seedAges('window-e@party.local', [20, 24, 28, 32, 36]);
				recordLoginFailure('somebody-else@party.local');
				expect(checkRegisterRateLimit('window-e@party.local').blocked).toBe(true);
			});
		});
	});
});

/**
 * The login counter lives in the same table with a different key prefix. Reading it
 * through the login helper is the only honest way to assert the namespaces do not
 * overlap, so this mirrors checkLoginRateLimit's query.
 */
function checkLoginBudgetIsSeparate(account: string): boolean {
	const hash = crypto.createHash('sha256').update(account.trim().toLowerCase()).digest('hex');
	const row = getDb()
		.prepare(
			`SELECT COUNT(*) AS failures FROM login_attempts
       WHERE account_hash = ? AND attempted_at >= ?`
		)
		.get(hash, Date.now() - 15 * 60 * 1000) as { failures: number } | undefined;
	return (row?.failures || 0) === 0;
}
