import type { PageServerLoad } from './$types';
import { listEventsForHost } from '$lib/server/db/repositories/event.repository';
import { getRsvpSummary } from '$lib/server/db/repositories/rsvp.repository';

export const load: PageServerLoad = async ({ locals }) => {
	const events = listEventsForHost(locals.user!.id);

	const eventsWithStats = events.map((e) => {
		const rsvp = getRsvpSummary(e.id);
		const isPast = new Date(e.dateStart).getTime() < Date.now();
		return {
			...e,
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
