import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import { createEvent } from '../../../src/lib/server/db/repositories/event.repository';
import {
	registerGuest,
	findGuestByDeviceToken
} from '../../../src/lib/server/db/repositories/guest.repository';
import { upsertRsvp } from '../../../src/lib/server/db/repositories/rsvp.repository';
import {
	getOrCreateCompanionInvite,
	claimCompanionInvite,
	findAvailableCompanionInvite
} from '../../../src/lib/server/db/repositories/companion-invite.repository';
import { guestSeesAnnouncements } from '../../../src/lib/server/announcements/audience';
import { createUser } from '../../../src/lib/server/db/repositories/user.repository';
import { hashPassword } from '../../../src/lib/server/auth/password';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery';

/**
 * Who receives a host announcement.
 *
 * An independent verifier found that the original predicate had a companion branch
 * that could never be true: `companionInvites` is only populated when the guest's OWN
 * rsvp is 'yes', and a companion is rejected by submitRsvp outright, so a companion
 * never has an rsvp row and never has invites. The result was safe by accident - a
 * companion of a CONFIRMED guest received nothing, while the commit message and the
 * feature card both promised they would.
 *
 * The question has to be asked about the owner, resolved through the claimed invite.
 */
describe('Announcement audience', () => {
	let hostId = '';

	beforeAll(async () => {
		runMigrations();
		const pwdHash = await hashPassword('AudienceHost123!');
		const codes = generateRecoveryCodes(10).map((c) => c.codeHash);
		const { user } = createUser(`audience-host-${Date.now()}@party.local`, pwdHash, codes);
		hostId = user.id;
	});

	it('shows announcements to a guest who confirmed', () => {
		const event = createEvent(hostId, {
			title: 'Zusage sieht',
			dateStart: '2026-12-01T18:00:00.000Z'
		});
		const yes = registerGuest(event.id, 'aud-yes', 'Zusager');
		upsertRsvp(event.id, yes.id, { status: 'yes' });

		expect(guestSeesAnnouncements(event.id, yes)).toBe(true);
	});

	it('withholds them from a guest who declined and from one who stayed silent', () => {
		const event = createEvent(hostId, {
			title: 'Absage sieht nicht',
			dateStart: '2026-12-02T18:00:00.000Z'
		});
		const no = registerGuest(event.id, 'aud-no', 'Absager');
		upsertRsvp(event.id, no.id, { status: 'no' });
		const maybe = registerGuest(event.id, 'aud-maybe', 'Vielleicht');
		upsertRsvp(event.id, maybe.id, { status: 'maybe' });
		const silent = registerGuest(event.id, 'aud-silent', 'Still');

		expect(guestSeesAnnouncements(event.id, no)).toBe(false);
		expect(guestSeesAnnouncements(event.id, maybe)).toBe(false);
		expect(guestSeesAnnouncements(event.id, silent)).toBe(false);
		expect(guestSeesAnnouncements(event.id, null)).toBe(false);
	});

	it('shows announcements to the companion of a guest who confirmed', () => {
		const event = createEvent(hostId, {
			title: 'Begleitung sieht',
			dateStart: '2026-12-03T18:00:00.000Z'
		});
		const owner = registerGuest(event.id, 'aud-owner', 'Gastgeberin');
		upsertRsvp(event.id, owner.id, { status: 'yes', companionCount: 1 });

		const token = getOrCreateCompanionInvite(event.id, owner.id, 'Anna');
		const inviteId = findInviteIdByToken(event.id, token);
		const companion = registerGuest(event.id, 'aud-companion', 'Anna', false, inviteId);
		claimCompanionInvite(event.id, token, companion.id);

		// Re-read the row the way the runtime does: via the device token.
		const companionRow = findGuestByDeviceToken(event.id, 'aud-companion')!;
		expect(companionRow.isCompanion).toBe(true);
		expect(guestSeesAnnouncements(event.id, companionRow)).toBe(true);
	});

	it('withholds them from the companion of a guest who declined', () => {
		const event = createEvent(hostId, {
			title: 'Begleitung sieht nicht',
			dateStart: '2026-12-04T18:00:00.000Z'
		});
		const owner = registerGuest(event.id, 'aud-owner-no', 'Absagende');
		upsertRsvp(event.id, owner.id, { status: 'no' });

		const token = getOrCreateCompanionInvite(event.id, owner.id, 'Bernd');
		const inviteId = findInviteIdByToken(event.id, token);
		const companion = registerGuest(event.id, 'aud-companion-no', 'Bernd', false, inviteId);
		claimCompanionInvite(event.id, token, companion.id);

		const companionRow = findGuestByDeviceToken(event.id, 'aud-companion-no')!;
		expect(companionRow.isCompanion).toBe(true);
		expect(guestSeesAnnouncements(event.id, companionRow)).toBe(false);
	});
});

/**
 * registerGuest() stores only the invite id on the guest row, so the test needs the id
 * behind a freshly minted token before it can create the companion.
 */
function findInviteIdByToken(eventId: string, token: string): string {
	return findAvailableCompanionInvite(eventId, token)!.id;
}
