import crypto from 'node:crypto';
import { getDb } from '../db/client';

/**
 * Login brute-force protection (audit DYN-01 / AUTH-01).
 *
 * Keyed by a hash of the *account* (email), never by IP: at a school event every
 * guest sits behind a single shared public IP, so a per-IP limit would lock out
 * the whole audience after a handful of typos. Per-account limiting stops online
 * brute force without that collateral damage.
 */

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Hashes the account identifier for the attempt log. The email itself is stored
 * encrypted in the users table; here we only keep a non-reversible digest so the
 * throttle table never becomes a plaintext list of host addresses.
 */
function hashAccount(account: string): string {
	return crypto.createHash('sha256').update(account.trim().toLowerCase()).digest('hex');
}

function pruneOldAttempts(accountHash: string, now: number): void {
	getDb()
		.prepare('DELETE FROM login_attempts WHERE account_hash = ? AND attempted_at < ?')
		.run(accountHash, now - LOGIN_WINDOW_MS);
}

export interface RateLimitStatus {
	blocked: boolean;
	remaining: number;
	retryAfterSeconds: number;
}

/**
 * Returns the current throttle state for an account without recording an attempt.
 */
export function checkLoginRateLimit(account: string): RateLimitStatus {
	const accountHash = hashAccount(account);
	const now = Date.now();

	pruneOldAttempts(accountHash, now);

	const row = getDb()
		.prepare(
			`
      SELECT COUNT(*) AS failures, MAX(attempted_at) AS last_attempt
      FROM login_attempts
      WHERE account_hash = ? AND attempted_at >= ?
    `
		)
		.get(accountHash, now - LOGIN_WINDOW_MS) as { failures: number; last_attempt: number | null };

	const failures = row?.failures || 0;
	if (failures < LOGIN_MAX_FAILURES) {
		return {
			blocked: false,
			remaining: LOGIN_MAX_FAILURES - failures,
			retryAfterSeconds: 0
		};
	}

	// Blocked: the window restarts from the most recent failed attempt.
	const windowEnd = (row?.last_attempt || now) + LOGIN_WINDOW_MS;
	return {
		blocked: true,
		remaining: 0,
		retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000))
	};
}

/**
 * Records a failed login attempt for the given account.
 */
export function recordLoginFailure(account: string): void {
	const accountHash = hashAccount(account);
	const db = getDb();

	const insert = db.prepare(
		'INSERT INTO login_attempts (account_hash, attempted_at) VALUES (?, ?)'
	);
	insert.run(accountHash, Date.now());

	// Keep the table bounded: drop anything past the window for this account and
	// opportunistically purge other stale rows.
	pruneOldAttempts(accountHash, Date.now());
	db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').run(Date.now() - LOGIN_WINDOW_MS);
}

/**
 * Clears the failure counter for an account after a successful login.
 */
export function clearLoginFailures(account: string): void {
	getDb().prepare('DELETE FROM login_attempts WHERE account_hash = ?').run(hashAccount(account));
}
