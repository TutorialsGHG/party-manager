import { findRsvpByGuestId } from '../db/repositories/rsvp.repository';
import { findCompanionOwnerGuestId } from '../db/repositories/companion-invite.repository';
import type { GuestData } from '../db/repositories/guest.repository';

/**
 * Whether this guest should receive the host's announcements.
 *
 * Deliberately a single function used by BOTH the page load and the SSE route. Those
 * two disagreed once: the load filtered on the guest's own RSVP, the SSE route did not
 * filter at all, and the plaintext leaked to guests who had declined.
 *
 * The companion case is the subtle one. A companion NEVER has an rsvp row - submitRsvp
 * rejects companions outright - so asking "is your own RSVP 'yes'?" is always false
 * for them. An earlier version therefore had a companion branch that could never be
 * true: companions of a confirmed guest received nothing at all. The question has to be
 * answered about their owner instead.
 *
 * The owner is resolved through the invite the companion claimed, so a companion of a
 * guest who declined is correctly excluded.
 */
export function guestSeesAnnouncements(
	eventId: string,
	guest: Pick<GuestData, 'id' | 'isCompanion'> | null
): boolean {
	if (!guest) return false;

	if (!guest.isCompanion) {
		return findRsvpByGuestId(eventId, guest.id)?.status === 'yes';
	}

	const ownerGuestId = findCompanionOwnerGuestId(eventId, guest.id);
	if (!ownerGuestId) return false;
	return findRsvpByGuestId(eventId, ownerGuestId)?.status === 'yes';
}
