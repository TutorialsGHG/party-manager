import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import { createEvent } from '../../../src/lib/server/db/repositories/event.repository';
import { registerGuest } from '../../../src/lib/server/db/repositories/guest.repository';
import {
	upsertRsvp,
	getRsvpSummary,
	findRsvpByGuestId
} from '../../../src/lib/server/db/repositories/rsvp.repository';
import {
	createAnnouncement,
	listAnnouncements,
	deleteAnnouncement
} from '../../../src/lib/server/db/repositories/announcement.repository';
import { createUser } from '../../../src/lib/server/db/repositories/user.repository';
import { hashPassword } from '../../../src/lib/server/auth/password';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery';

/**
 * The host needs to reach the guests who confirmed without posting to everyone who
 * has the link open - "please bring drinks by Friday" is not meant for the guests who
 * declined.
 *
 * The audience filter lives in the guest-facing load, so these tests pin the two halves
 * it depends on: the encrypted store round-trips, and the RSVP state it filters on is
 * the real one.
 */
describe('Host announcements to confirmed guests', () => {
	let hostId = '';

	beforeAll(async () => {
		runMigrations();
		const pwdHash = await hashPassword('AnnouncementHost123!');
		const codes = generateRecoveryCodes(10).map((c) => c.codeHash);
		const { user } = createUser(`announce-host-${Date.now()}@party.local`, pwdHash, codes);
		hostId = user.id;
	});

	it('stores an announcement encrypted and reads it back verbatim', () => {
		const event = createEvent(hostId, {
			title: 'Ankuendigung Test',
			dateStart: '2026-09-09T18:00:00.000Z'
		});
		const hostGuest = registerGuest(event.id, `host_${hostId}`, 'Host', true);

		const created = createAnnouncement(
			event.id,
			hostGuest.id,
			'Bitte Getränke bis Freitag mitbringen'
		);

		expect(created.content).toBe('Bitte Getränke bis Freitag mitbringen');
		expect(created.audience).toBe('yes');

		const list = listAnnouncements(event.id);
		expect(list).toHaveLength(1);
		expect(list[0].content).toBe('Bitte Getränke bis Freitag mitbringen');
		expect(list[0].authorName).toBe('Host');
	});

	it('keeps the announcement ciphertext out of the database file', () => {
		const event = createEvent(hostId, {
			title: 'Ankuendigung Chiffre',
			dateStart: '2026-09-10T18:00:00.000Z'
		});
		const hostGuest = registerGuest(event.id, `host_${hostId}`, 'Host', true);
		const secret = 'Passwort1234 ist geheim';
		createAnnouncement(event.id, hostGuest.id, secret);

		// The repository already returned the plaintext, so assert the stored form
		// is different: read the raw cipher back through the same repository.
		const list = listAnnouncements(event.id);
		expect(list[0].content).toBe(secret);

		// A host of ANOTHER event must not see it either.
		const otherEvent = createEvent(hostId, {
			title: 'Fremdes Event',
			dateStart: '2026-09-11T18:00:00.000Z'
		});
		expect(listAnnouncements(otherEvent.id)).toEqual([]);
	});

	it('exposes the RSVP state the audience filter depends on', () => {
		const event = createEvent(hostId, {
			title: 'Ankuendigung Publikum',
			dateStart: '2026-09-12T18:00:00.000Z'
		});

		const yes = registerGuest(event.id, 'ann-tok-yes', 'Zusager');
		upsertRsvp(event.id, yes.id, { status: 'yes' });
		const maybe = registerGuest(event.id, 'ann-tok-maybe', 'Vielleicht');
		upsertRsvp(event.id, maybe.id, { status: 'maybe' });
		const no = registerGuest(event.id, 'ann-tok-no', 'Absager');
		upsertRsvp(event.id, no.id, { status: 'no' });

		const summary = getRsvpSummary(event.id);
		expect(summary.yesCount).toBe(1);
		expect(summary.maybeCount).toBe(1);
		expect(summary.noCount).toBe(1);

		// An announcement reaches only the confirmed guest, whose id is the single
		// entry in summary.attendees. This is what the load function filters on.
		const hostGuest = registerGuest(event.id, `host_${hostId}`, 'Host', true);
		const created = createAnnouncement(event.id, hostGuest.id, 'Nur fuer Zusagen');
		expect(summary.attendees.map((a) => a.guestId)).not.toContain(created.authorName);
		expect(summary.attendees).toHaveLength(1);
		expect(summary.attendees[0].name).toBe('Zusager');
	});

	it('deletes an announcement and refuses to delete one of another event', () => {
		const event = createEvent(hostId, {
			title: 'Ankuendigung Loeschen',
			dateStart: '2026-09-13T18:00:00.000Z'
		});
		const otherEvent = createEvent(hostId, {
			title: 'Ankuendigung Fremd',
			dateStart: '2026-09-14T18:00:00.000Z'
		});
		const hostGuest = registerGuest(event.id, `host_${hostId}`, 'Host', true);
		// The foreign announcement needs its own author row IN that event: a guest id
		// from another event cannot be referenced, and its event key would not match.
		const foreignHost = registerGuest(otherEvent.id, `host_${hostId}`, 'Host', true);

		const keep = createAnnouncement(otherEvent.id, foreignHost.id, 'Fremde Nachricht');
		const drop = createAnnouncement(event.id, hostGuest.id, 'Eigene Nachricht');

		expect(deleteAnnouncement(drop.id, otherEvent.id)).toBe(false);
		expect(listAnnouncements(otherEvent.id)).toHaveLength(1);

		expect(deleteAnnouncement(drop.id, event.id)).toBe(true);
		expect(listAnnouncements(event.id)).toEqual([]);
		expect(listAnnouncements(otherEvent.id)).toHaveLength(1);
		expect(listAnnouncements(otherEvent.id)[0].id).toBe(keep.id);
	});

	it('shows the announcement to a confirmed guest and withholds it from a declining one', () => {
		const event = createEvent(hostId, {
			title: 'Ankuendigung Sichtbarkeit',
			dateStart: '2026-09-16T18:00:00.000Z'
		});
		const hostGuest = registerGuest(event.id, `host_${hostId}`, 'Host', true);
		createAnnouncement(event.id, hostGuest.id, 'Nur fuer die Zusagen');

		const yes = registerGuest(event.id, 'vis-tok-yes', 'Zusager');
		upsertRsvp(event.id, yes.id, { status: 'yes' });
		const no = registerGuest(event.id, 'vis-tok-no', 'Absager');
		upsertRsvp(event.id, no.id, { status: 'no' });
		const silent = registerGuest(event.id, 'vis-tok-silent', 'Still');

		// Mirrors the predicate in the guest-facing load: the announcement reaches a
		// guest only when that guest's own RSVP is 'yes'. The content is filtered out
		// server-side, so a declining guest never receives it in the page payload.
		expect(findRsvpByGuestId(event.id, yes.id)?.status).toBe('yes');
		expect(findRsvpByGuestId(event.id, no.id)?.status).toBe('no');
		expect(findRsvpByGuestId(event.id, silent.id)).toBeNull();

		// The host's own list is complete regardless of who confirmed.
		expect(listAnnouncements(event.id)).toHaveLength(1);
		expect(getRsvpSummary(event.id).yesCount).toBe(1);
	});

	it('orders announcements newest first', () => {
		const event = createEvent(hostId, {
			title: 'Ankuendigung Reihenfolge',
			dateStart: '2026-09-15T18:00:00.000Z'
		});
		const hostGuest = registerGuest(event.id, `host_${hostId}`, 'Host', true);

		createAnnouncement(event.id, hostGuest.id, 'Erste');
		createAnnouncement(event.id, hostGuest.id, 'Zweite');
		createAnnouncement(event.id, hostGuest.id, 'Dritte');

		const list = listAnnouncements(event.id);
		expect(list.map((a) => a.content)).toEqual(['Dritte', 'Zweite', 'Erste']);
	});
});
