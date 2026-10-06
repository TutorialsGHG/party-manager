import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import { createEvent } from '../../../src/lib/server/db/repositories/event.repository';
import { registerGuest } from '../../../src/lib/server/db/repositories/guest.repository';
import { upsertRsvp } from '../../../src/lib/server/db/repositories/rsvp.repository';
import { guestSeesAnnouncements } from '../../../src/lib/server/announcements/audience';
import { createUser } from '../../../src/lib/server/db/repositories/user.repository';
import { hashPassword } from '../../../src/lib/server/auth/password';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery';

/**
 * The SSE route evaluates the audience predicate on every announcement broadcast, and
 * the code comment justifies that with "an RSVP cannot change while the socket is
 * open". That was asserted, never checked.
 *
 * A guest can change their own RSVP from the same page that holds the EventSource open
 * - the invite page has an RSVP form. If a guest confirmed, opened the stream, then
 * declined, the per-broadcast evaluation means they stop receiving announcements
 * immediately. That is the desired behaviour and the reason the check cannot be
 * cached per connection.
 */
describe('Announcement audience is re-evaluated, not cached per connection', () => {
	let hostId = '';

	beforeAll(async () => {
		runMigrations();
		const pwdHash = await hashPassword('AudienceLive123!');
		const codes = generateRecoveryCodes(10).map((c) => c.codeHash);
		const { user } = createUser(`audience-live-${Date.now()}@party.local`, pwdHash, codes);
		hostId = user.id;
	});

	it('stops delivering once a guest changes their RSVP while connected', () => {
		const event = createEvent(hostId, {
			title: 'RSVPwechsel bei offener Verbindung',
			dateStart: '2027-01-05T18:00:00.000Z'
		});
		const guest = registerGuest(event.id, 'live-change-tok', 'Wechslerin');

		// Confirmed when the stream opens.
		upsertRsvp(event.id, guest.id, { status: 'yes' });
		expect(guestSeesAnnouncements(event.id, guest)).toBe(true);

		// Same open connection, guest declines on the invite page.
		upsertRsvp(event.id, guest.id, { status: 'no' });
		expect(guestSeesAnnouncements(event.id, guest)).toBe(false);

		// And back again.
		upsertRsvp(event.id, guest.id, { status: 'yes' });
		expect(guestSeesAnnouncements(event.id, guest)).toBe(true);
	});

	it('never delivers to a guest who declined, before or after a change', () => {
		const event = createEvent(hostId, {
			title: 'Absage bleibt Absage',
			dateStart: '2027-01-06T18:00:00.000Z'
		});
		const guest = registerGuest(event.id, 'live-no-tok', 'Absager');
		upsertRsvp(event.id, guest.id, { status: 'no' });

		// Touching the record at all must not hand over an announcement.
		upsertRsvp(event.id, guest.id, { status: 'no', notes: 'Bin leider krank' });
		expect(guestSeesAnnouncements(event.id, guest)).toBe(false);
	});
});
