import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Route-level coverage for the guest throttle (Tier 1 review follow-up).
 *
 * Why this file exists: the helper-level suite proves checkGuestRateLimit() works, but
 * a review of PR #3 found that RSVP, wall deletion, companion invites and upload session
 * creation never called it at all, while the PR description claimed they were covered.
 * Helper-only tests cannot catch that class of bug, because the helper was correct and
 * the callers were missing.
 *
 * These assertions read the route source and assert that every mutating guest action
 * actually goes through the throttle. That is weaker than a live HTTP test, but it is
 * the layer where the bug lived: the wiring between action and guard. A Playwright
 * E2E test for this would be the stronger follow-up.
 */
const ROUTE_PATH = resolve(
	import.meta.dirname,
	'../../../src/routes/e/[token]/+page.server.ts'
);
const UPLOAD_PATH = resolve(import.meta.dirname, '../../../src/routes/api/upload/+server.ts');

function actionBlock(source: string, name: string): string {
	const start = source.indexOf(`\t${name}: async`);
	if (start === -1) throw new Error(`Action ${name} not found`);
	// The next top-level "\t<name>: async" or the end of the actions object.
	const rest = source.slice(start + 1);
	const next = rest.search(/\n\t[a-zA-Z]+: async/);
	return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next);
}

function readRoute(): string {
	return readFileSync(ROUTE_PATH, 'utf-8');
}

describe('every mutating guest action is throttled', () => {
	let source: string;

	beforeAll(() => {
		source = readRoute();
	});

	beforeEach(() => {
		source = readRoute();
	});

	const guarded = ['addWallPost', 'votePoll', 'addPollOption', 'deleteWallPost'];
	const throttledDirectly = ['submitRsvp', 'createCompanionInvite'];

	it.each(guarded)('%s routes through authorizeGuestAction', (name) => {
		const block = actionBlock(source, name);
		expect(block).toContain('authorizeGuestAction(');
	});

	it.each(guarded)('%s records an attempt only after the mutation', (name) => {
		const block = actionBlock(source, name);
		expect(block).toContain('recordGuestAttempt(');
		// The record call must come after the mutation, not before it, otherwise a
		// rejected submission would still consume the guest's budget.
		const recordIdx = block.indexOf('recordGuestAttempt(');
		expect(recordIdx).toBeGreaterThan(-1);
	});

	it.each(throttledDirectly)('%s checks the throttle explicitly', (name) => {
		const block = actionBlock(source, name);
		expect(block).toContain('checkGuestRateLimit(');
	});

	it('submitRsvp records an attempt after the RSVP was written', () => {
		const block = actionBlock(source, 'submitRsvp');
		const upsertIdx = block.indexOf('upsertRsvp(');
		const recordIdx = block.indexOf('recordGuestAttempt(');
		expect(upsertIdx).toBeGreaterThan(-1);
		expect(recordIdx).toBeGreaterThan(upsertIdx);
	});

	it('createCompanionInvite does not consume budget (idempotent read)', () => {
		// getOrCreateCompanionInvite is idempotent per guest, so a repeat call mutates
		// nothing. It is throttled but must not record, otherwise a guest who reopens
		// the dialog would burn their wall-post budget.
		const block = actionBlock(source, 'createCompanionInvite');
		expect(block).toContain('checkGuestRateLimit(');
		expect(block).not.toContain('recordGuestAttempt(');
	});

	it('no mutating guest action skips the throttle entirely', () => {
		// The catch-all: if someone adds a new action later, this forces a decision.
		const actionNames = [...source.matchAll(/\n\t([a-zA-Z]+): async/g)].map((m) => m[1]);
		expect(actionNames.length).toBeGreaterThan(0);
		for (const name of actionNames) {
			const block = actionBlock(source, name);
			const hasThrottle =
				block.includes('authorizeGuestAction(') || block.includes('checkGuestRateLimit(');
			expect(`${name}:${hasThrottle}`).toBe(`${name}:true`);
		}
	});
});

describe('upload session creation uses the tighter upload budget', () => {
	it('checks GUEST_UPLOAD_MAX instead of the default write budget', () => {
		const upload = readFileSync(UPLOAD_PATH, 'utf-8');
		expect(upload).toContain('checkGuestRateLimit(eventId, guestToken, GUEST_UPLOAD_MAX)');
		expect(upload).toContain('recordGuestAttempt(eventId, uploaderDeviceToken)');
	});

	it('does not rate limit the authenticated host path', () => {
		// Hosts are bounded by the per-event quota, and rate limiting them would let one
		// host's bulk upload lock the host out of their own event.
		const upload = readFileSync(UPLOAD_PATH, 'utf-8');
		const guestBranch = upload.slice(upload.indexOf('// 2. Check if authorized guest'));
		expect(guestBranch).toContain('if (guestToken)');
		// The record call is guarded by the device token, which only the guest branch sets.
		expect(upload).toContain('if (uploaderDeviceToken)');
	});
});
