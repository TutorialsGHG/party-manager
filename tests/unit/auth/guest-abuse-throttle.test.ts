import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
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
	REGISTER_MAX
} from '../../../src/lib/server/auth/rate-limit.js';

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
				recordGuestAttempt(EVENT, DEVICE);
			}
			expect(checkGuestRateLimit(EVENT, DEVICE, GUEST_UPLOAD_MAX).blocked).toBe(true);
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
