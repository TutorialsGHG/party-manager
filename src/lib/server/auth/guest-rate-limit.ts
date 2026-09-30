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

/**
 * The independent budgets a guest gets, keyed by the column that namespaces them in
 * `guest_attempts`.
 *
 * NAMESPACING IS LOAD-BEARING, and the reason is a bug this module originally shipped.
 * `checkGuestRateLimit` took `(limit, windowMs)` as free parameters and both counters
 * counted rows in the SAME table with no discriminator, so a guest who spent their
 * legal upload budget silently ate their wall-post budget too: 10 uploads left only
 * 10 of 20 posts, and 20 posts blocked uploads even though the upload allowance was
 * untouched. A budget is only meaningful if spending one does not debit another.
 *
 * The callers pick a budget by name instead of passing numbers, so a limit and its
 * window can no longer be mismatched at a call site - the same class of mistake the
 * LOGIN_WINDOW_MS prune bug in rate-limit.ts made (documented there).
 */
export type GuestBudget = 'write' | 'upload';

interface BudgetConfig {
	limit: number;
	windowMs: number;
}

/** Wall posts, poll votes, poll options and RSVP changes are one-per-second-scale actions. */
const WRITE_BUDGET: BudgetConfig = { limit: 20, windowMs: 10 * 60 * 1000 }; // 20 per 10 min

/** Upload session creation reserves quota, so it gets its own, tighter budget. */
const UPLOAD_BUDGET: BudgetConfig = { limit: 10, windowMs: 10 * 60 * 1000 }; // 10 per 10 min

const BUDGETS: Record<GuestBudget, BudgetConfig> = {
	write: WRITE_BUDGET,
	upload: UPLOAD_BUDGET
};

/** Widest window any budget uses; the opportunistic global sweep may only use this. */
const MAX_WINDOW_MS = Math.max(WRITE_BUDGET.windowMs, UPLOAD_BUDGET.windowMs);

export const GUEST_WRITE_MAX = WRITE_BUDGET.limit;
export const GUEST_UPLOAD_MAX = UPLOAD_BUDGET.limit;

export interface GuestRateLimitStatus {
	blocked: boolean;
	remaining: number;
	retryAfterSeconds: number;
}

function hashDeviceToken(eventId: string, deviceToken: string): string {
	return crypto.createHash('sha256').update(`${eventId}:${deviceToken}`).digest('hex');
}

function config(budget: GuestBudget): BudgetConfig {
	const cfg = BUDGETS[budget];
	if (!cfg) {
		// Unreachable for typed callers. If a raw string ever arrives from a
		// non-typed caller, fail closed rather than fall back to an unlimited budget.
		throw new Error(`Unbekanntes Gast-Budget: ${budget}`);
	}
	return cfg;
}

/**
 * Drops the expired rows of ONE device in ONE budget.
 *
 * `windowMs` is a parameter on purpose: this function is shared by the write and the
 * upload counter, and pruning both with a single hardcoded window would silently
 * expire rows the other counter still has to count.
 */
function pruneOldAttempts(
	eventId: string,
	tokenHash: string,
	budget: GuestBudget,
	now: number,
	windowMs: number
): void {
	getDb()
		.prepare(
			`DELETE FROM guest_attempts
       WHERE event_id = ? AND device_token_hash = ? AND budget = ? AND attempted_at < ?`
		)
		.run(eventId, tokenHash, budget, now - windowMs);
}

/**
 * Returns the throttle state for one guest on one budget without recording an attempt.
 */
export function checkGuestRateLimit(
	eventId: string,
	deviceToken: string,
	budget: GuestBudget = 'write'
): GuestRateLimitStatus {
	const { limit, windowMs } = config(budget);

	if (!deviceToken) {
		// No device token means no guest identity. The routes reject this before
		// reaching here; returning "blocked" keeps a missing identity from looking
		// like an unlimited one.
		return { blocked: true, remaining: 0, retryAfterSeconds: windowMs / 1000 };
	}

	const tokenHash = hashDeviceToken(eventId, deviceToken);
	const now = Date.now();
	pruneOldAttempts(eventId, tokenHash, budget, now, windowMs);

	const row = getDb()
		.prepare(
			`SELECT COUNT(*) AS attempts, MAX(attempted_at) AS last_attempt
       FROM guest_attempts
       WHERE event_id = ? AND device_token_hash = ? AND budget = ? AND attempted_at >= ?`
		)
		.get(eventId, tokenHash, budget, now - windowMs) as
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
 * Records one action by a guest against ONE budget. Call this only after the action
 * was actually performed, so a rejected submission does not consume the guest's budget.
 */
export function recordGuestAttempt(
	eventId: string,
	deviceToken: string,
	budget: GuestBudget = 'write'
): void {
	const { windowMs } = config(budget);
	const tokenHash = hashDeviceToken(eventId, deviceToken);
	const now = Date.now();

	getDb()
		.prepare(
			`INSERT INTO guest_attempts (event_id, device_token_hash, budget, attempted_at)
       VALUES (?, ?, ?, ?)`
		)
		.run(eventId, tokenHash, budget, now);

	pruneOldAttempts(eventId, tokenHash, budget, now, windowMs);

	// Opportunistically bound the table: one guest cannot grow it without limit by
	// hammering across many events. The sweep spans every budget, so it must use the
	// widest window - pruning with a narrower one would delete rows a wider budget
	// still has to count.
	getDb()
		.prepare('DELETE FROM guest_attempts WHERE attempted_at < ?')
		.run(now - MAX_WINDOW_MS);
}
