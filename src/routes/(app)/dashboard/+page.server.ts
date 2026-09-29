import type { PageServerLoad } from './$types';
import { listEventsForHost } from '$lib/server/db/repositories/event.repository';
import { getRsvpSummary } from '$lib/server/db/repositories/rsvp.repository';
import { requireUser } from '$lib/server/auth/require-user';

export const load: PageServerLoad = async ({ locals }) => {
	const events = listEventsForHost(requireUser(locals).id);

	const eventsWithStats = events.map((e) => {
		const rsvp = getRsvpSummary(e.id);
		const isPast = new Date(e.dateStart).getTime() < Date.now();
		// tokenHash never leaves the server: the plaintext invite token is only
		// returned at creation/regeneration time.
		const { tokenHash: _tokenHash, ...safeEvent } = e;
		return {
			...safeEvent,
			totalAttending: rsvp.totalAttending,
			isPast
		};
	});

	const upcoming = eventsWithStats.filter((e) => !e.isPast);
	const past = eventsWithStats.filter((e) => e.isPast);

	return {
		upcoming,
		past
	};
};
