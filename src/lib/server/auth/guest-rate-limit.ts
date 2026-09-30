import crypto from 'node:crypto';
import { getDb } from '../db/client';

/**
 * Abuse throttling for the public guest paths (Tier 1 hardening).
 *
 * The invitation routes at /e/[token] are unauthenticated by design: anyone holding
 * the link may RSVP, post to the wall, vote in polls and open an upload session.
 * Until now none of those actions was throttled at all, so a single `curl` loop could
 * fill the wall of every event it knew the UUID for.
 *
 * Keyed by a hash of the per-event device token, never by IP. This is the same
 * constraint that shapes login_attempts (migration 005): at a school event every
 * guest sits behind one shared public IP, so a per-IP limit would lock out the whole
 * audience after a handful of legitimate actions - the exact people the app exists
 * for. The device token is per browser and per event, so the throttle tracks the
 * offending device without touching bystanders on the same NAT.
 *
 * The raw token is never stored: only a SHA-256 digest, so this table cannot become
 * a list of valid guest credentials.
 */

/** Wall posts, poll votes and RSVP changes are one-per-second-scale actions. */
export const GUEST_WRITE_MAX = 20;
export const GUEST_WRITE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/** Upload session creation is heavier, so it gets its own, tighter budget. */
export const GUEST_UPLOAD_MAX = 10;
export const GUEST_UPLOAD_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export interface GuestRateLimitStatus {
	blocked: boolean;
	remaining: number;
	retryAfterSeconds: number;
}

function hashDeviceToken(eventId: string, deviceToken: string): string {
	return crypto.createHash('sha256').update(`${eventId}:${deviceToken}`).digest('hex');
}

function pruneOldAttempts(eventId: string, tokenHash: string, now: number): void {
	getDb()
		.prepare(
			'DELETE FROM guest_attempts WHERE event_id = ? AND device_token_hash = ? AND attempted_at < ?'
		)
		.run(eventId, tokenHash, now - GUEST_WRITE_WINDOW_MS);
}

/**
 * Returns the throttle state for one guest on one event without recording an attempt.
 */
export function checkGuestRateLimit(
	eventId: string,
	deviceToken: string,
	limit: number = GUEST_WRITE_MAX,
	windowMs: number = GUEST_WRITE_WINDOW_MS
): GuestRateLimitStatus {
	if (!deviceToken) {
		// No device token means no guest identity. The routes reject this before
		// reaching here; returning "blocked" keeps a missing identity from looking
		// like an unlimited one.
		return { blocked: true, remaining: 0, retryAfterSeconds: GUEST_WRITE_WINDOW_MS / 1000 };
	}

	const tokenHash = hashDeviceToken(eventId, deviceToken);
	const now = Date.now();
	pruneOldAttempts(eventId, tokenHash, now);

	const row = getDb()
		.prepare(
			`SELECT COUNT(*) AS attempts, MAX(attempted_at) AS last_attempt
       FROM guest_attempts
       WHERE event_id = ? AND device_token_hash = ? AND attempted_at >= ?`
		)
		.get(eventId, tokenHash, now - windowMs) as
		{ attempts: number; last_attempt: number | null } | undefined;

	const attempts = row?.attempts || 0;
	if (attempts < limit) {
		return { blocked: false, remaining: limit - attempts, retryAfterSeconds: 0 };
	}

	// Blocked: the window restarts from the most recent recorded attempt.
	const windowEnd = (row?.last_attempt || now) + windowMs;
	return {
		blocked: true,
		remaining: 0,
		retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000))
	};
}

/**
 * Records one action by a guest. Call this only after the action was actually
 * performed, so a rejected submission does not consume the guest's budget.
 */
export function recordGuestAttempt(eventId: string, deviceToken: string): void {
	const tokenHash = hashDeviceToken(eventId, deviceToken);
	const db = getDb();

	db.prepare(
		'INSERT INTO guest_attempts (event_id, device_token_hash, attempted_at) VALUES (?, ?, ?)'
	).run(eventId, tokenHash, Date.now());

	pruneOldAttempts(eventId, tokenHash, Date.now());

	// Opportunistically bound the table: one guest cannot grow it without limit by
	// hammering across many events.
	getDb()
		.prepare('DELETE FROM guest_attempts WHERE attempted_at < ?')
		.run(Date.now() - GUEST_WRITE_WINDOW_MS);
}
