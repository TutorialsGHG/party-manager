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

	it('never reports more companion names than there are companions', () => {
		const event = createEvent(hostId, {
			title: 'Begleitung Komma im Namen',
			dateStart: '2026-07-25T16:00:00.000Z'
		});

		// A single companion whose name itself contains a comma.
		const single = registerGuest(event.id, 'ov-tok-comma', 'Bernd');
		upsertRsvp(event.id, single.id, {
			status: 'yes',
			companionCount: 1,
			companionNames: 'Mueller, Anna'
		});

		const entry = listGuestOverview(event.id).find((g) => g.name === 'Bernd');
		expect(entry).toBeDefined();
		expect(entry!.companionCount).toBe(1);
		expect(entry!.companionNames).toEqual(['Mueller']);
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

	it('decrypts the guest notes the host entered as "Notizen oder Allergien"', () => {
		const event = createEvent(hostId, {
			title: 'Notizen fuer den Gastgeber',
			dateStart: '2026-07-27T16:00:00.000Z'
		});

		const guest = registerGuest(event.id, 'ov-tok-notes', 'Petra');
		upsertRsvp(event.id, guest.id, {
			status: 'yes',
			notes: 'Glutenfrei, keine Nüsse'
		});

		const entry = listGuestOverview(event.id).find((g) => g.name === 'Petra');
		expect(entry).toBeDefined();
		expect(entry!.notes).toBe('Glutenfrei, keine Nüsse');
	});

	it('keeps notes scoped to their own guest and does not leak across events', () => {
		const event = createEvent(hostId, {
			title: 'Notizen Isolation A',
			dateStart: '2026-07-28T16:00:00.000Z'
		});
		const otherEvent = createEvent(hostId, {
			title: 'Notizen Isolation B',
			dateStart: '2026-07-29T16:00:00.000Z'
		});

		const withNotes = registerGuest(event.id, 'ov-tok-n1', 'Mit Notiz');
		upsertRsvp(event.id, withNotes.id, { status: 'yes', notes: 'Vegan' });

		const withoutNotes = registerGuest(event.id, 'ov-tok-n2', 'Ohne Notiz');
		upsertRsvp(event.id, withoutNotes.id, { status: 'yes' });

		const foreign = registerGuest(otherEvent.id, 'ov-tok-n3', 'Fremder');
		upsertRsvp(otherEvent.id, foreign.id, { status: 'yes', notes: 'Fremde Notiz' });

		const overview = listGuestOverview(event.id);
		expect(overview.find((g) => g.name === 'Mit Notiz')!.notes).toBe('Vegan');
		expect(overview.find((g) => g.name === 'Ohne Notiz')!.notes).toBe('');
		expect(overview.map((g) => g.name)).not.toContain('Fremder');
	});

	it('trims whitespace-only notes to an empty string', () => {
		const event = createEvent(hostId, {
			title: 'Leere Notiz',
			dateStart: '2026-07-30T16:00:00.000Z'
		});

		const guest = registerGuest(event.id, 'ov-tok-blank', 'Niels');
		upsertRsvp(event.id, guest.id, { status: 'maybe', notes: '   ' });

		const entry = listGuestOverview(event.id).find((g) => g.name === 'Niels');
		expect(entry).toBeDefined();
		expect(entry!.notes).toBe('');
	});
});
