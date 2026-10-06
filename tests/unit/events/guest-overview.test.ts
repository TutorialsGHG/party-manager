import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import { createEvent } from '../../../src/lib/server/db/repositories/event.repository';
import {
	registerGuest,
	listGuestOverview
} from '../../../src/lib/server/db/repositories/guest.repository';
import {
	upsertRsvp,
	getRsvpSummary
} from '../../../src/lib/server/db/repositories/rsvp.repository';
import { createWallPost } from '../../../src/lib/server/db/repositories/wall.repository';
import { getOrCreateCompanionInvite } from '../../../src/lib/server/db/repositories/companion-invite.repository';
import { createUser } from '../../../src/lib/server/db/repositories/user.repository';
import { hashPassword } from '../../../src/lib/server/auth/password';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery';

/**
 * The host view must show every guest, not only the ones who sent an RSVP.
 *
 * `getRsvpSummary` reads the `rsvps` table, so a guest who opened the invitation,
 * posted on the wall or uploaded a photo but never confirmed is structurally
 * invisible there. These tests pin that the overview closes that gap.
 */
describe('Guest overview for the host', () => {
	let hostId = '';

	beforeAll(async () => {
		runMigrations();
		const pwdHash = await hashPassword('OverviewHost123!');
		const codes = generateRecoveryCodes(10).map((c) => c.codeHash);
		const { user } = createUser(`overview-host-${Date.now()}@party.local`, pwdHash, codes);
		hostId = user.id;
	});

	it('includes guests who never sent an RSVP', () => {
		const event = createEvent(hostId, {
			title: 'Sommerfest Übersicht',
			dateStart: '2026-07-20T16:00:00.000Z'
		});

		const confirmed = registerGuest(event.id, 'ov-tok-yes', 'Markus');
		upsertRsvp(event.id, confirmed.id, { status: 'yes' });

		// Opens the invite, never confirms.
		registerGuest(event.id, 'ov-tok-silent', 'Sophie');

		// The RSVP summary is blind to the silent guest...
		const summary = getRsvpSummary(event.id);
		expect(summary.yesCount).toBe(1);
		expect(summary.attendees.map((a) => a.name)).toEqual(['Markus']);

		// ...the overview is not.
		const overview = listGuestOverview(event.id);
		expect(overview).toHaveLength(2);
		const silent = overview.find((g) => g.name === 'Sophie');
		expect(silent).toBeDefined();
		expect(silent!.status).toBeNull();
		expect(silent!.isHost).toBe(false);
		expect(silent!.isCompanion).toBe(false);
	});

	it('counts wall posts per guest and keeps counts scoped to the event', () => {
		const event = createEvent(hostId, {
			title: 'Pinnwand Zählung',
			dateStart: '2026-07-21T16:00:00.000Z'
		});
		const otherEvent = createEvent(hostId, {
			title: 'Anderes Event',
			dateStart: '2026-07-22T16:00:00.000Z'
		});

		const noisy = registerGuest(event.id, 'ov-tok-wall', 'Lärmer');
		createWallPost(event.id, noisy.id, 'Hallo 1');
		createWallPost(event.id, noisy.id, 'Hallo 2');

		registerGuest(event.id, 'ov-tok-quiet', 'Still');

		// Same wall activity on a different event must not leak into this one.
		const foreign = registerGuest(otherEvent.id, 'ov-tok-foreign', 'Fremder');
		createWallPost(otherEvent.id, foreign.id, 'Fremder Beitrag');

		const overview = listGuestOverview(event.id);
		const noisyEntry = overview.find((g) => g.name === 'Lärmer');
		const quietEntry = overview.find((g) => g.name === 'Still');

		expect(noisyEntry).toBeDefined();
		expect(quietEntry).toBeDefined();
		expect(noisyEntry!.wallPostCount).toBe(2);
		expect(quietEntry!.wallPostCount).toBe(0);
		expect(overview.map((g) => g.name)).not.toContain('Fremder');
	});

	it('agrees with the RSVP summary about companion names', () => {
		const event = createEvent(hostId, {
			title: 'Begleitung Konsistenz',
			dateStart: '2026-07-23T16:00:00.000Z'
		});

		const guest = registerGuest(event.id, 'ov-tok-comp', 'Clara');
		upsertRsvp(event.id, guest.id, {
			status: 'yes',
			companionCount: 2,
			companionNames: 'Felix, Anna'
		});
		// The companion_invites rows are what getRsvpSummary reads. Both views must
		// answer identically - they are rendered on the same host page.
		//
		// getOrCreateCompanionInvite is idempotent per guest: the first call mints the
		// row and the second returns that same row's token, keeping its original name.
		getOrCreateCompanionInvite(event.id, guest.id, 'Felix');
		getOrCreateCompanionInvite(event.id, guest.id, 'Anna');

		const entry = listGuestOverview(event.id).find((g) => g.name === 'Clara');
		const summary = getRsvpSummary(event.id);

		expect(entry).toBeDefined();
		expect(summary.attendees).toHaveLength(1);
		// The decisive assertion: one source of truth for both views.
		expect(entry!.companionNames).toEqual(summary.attendees[0].companionNames);
		expect(entry!.companionNames.length).toBeGreaterThan(0);
	});

	it('keeps a comma inside a companion name intact', () => {
		const event = createEvent(hostId, {
			title: 'Begleitung Komma im Namen',
			dateStart: '2026-07-25T16:00:00.000Z'
		});

		// The name itself contains a comma. Splitting the stored list would tear this
		// into two names for one companion; reading companion_invites cannot.
		const single = registerGuest(event.id, 'ov-tok-comma', 'Bernd');
		upsertRsvp(event.id, single.id, {
			status: 'yes',
			companionCount: 1,
			companionNames: 'Mueller, Anna'
		});
		getOrCreateCompanionInvite(event.id, single.id, 'Mueller, Anna');

		const entry = listGuestOverview(event.id).find((g) => g.name === 'Bernd');
		expect(entry).toBeDefined();
		expect(entry!.companionNames).toEqual(['Mueller, Anna']);
		expect(entry!.companionNames).toHaveLength(entry!.companionCount);
	});

	it('reports no companion names when the companion count is zero', () => {
		const event = createEvent(hostId, {
			title: 'Ohne Begleitung',
			dateStart: '2026-07-26T16:00:00.000Z'
		});

		const guest = registerGuest(event.id, 'ov-tok-none', 'Ines');
		upsertRsvp(event.id, guest.id, { status: 'yes' });

		const entry = listGuestOverview(event.id).find((g) => g.name === 'Ines');
		expect(entry).toBeDefined();
		expect(entry!.companionCount).toBe(0);
		expect(entry!.companionNames).toEqual([]);
	});

	it('returns an empty list for an event without guests', () => {
		const event = createEvent(hostId, {
			title: 'Leeres Event',
			dateStart: '2026-07-24T16:00:00.000Z'
		});
		expect(listGuestOverview(event.id)).toEqual([]);
	});
});
