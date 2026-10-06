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

	it('decrypts companion names with the rsvp row AAD and splits them', () => {
		const event = createEvent(hostId, {
			title: 'Begleitung AAD',
			dateStart: '2026-07-23T16:00:00.000Z'
		});

		const guest = registerGuest(event.id, 'ov-tok-comp', 'Clara');
		upsertRsvp(event.id, guest.id, {
			status: 'yes',
			companionCount: 2,
			companionNames: 'Felix, Anna'
		});

		const entry = listGuestOverview(event.id).find((g) => g.name === 'Clara');
		expect(entry).toBeDefined();
		expect(entry!.companionCount).toBe(2);
		expect(entry!.companionNames).toEqual(['Felix', 'Anna']);
	});

	it('returns an empty list for an event without guests', () => {
		const event = createEvent(hostId, {
			title: 'Leeres Event',
			dateStart: '2026-07-24T16:00:00.000Z'
		});
		expect(listGuestOverview(event.id)).toEqual([]);
	});
});
