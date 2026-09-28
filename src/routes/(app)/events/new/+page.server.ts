import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createEvent } from '$lib/server/db/repositories/event.repository';
import { eventSchema } from '$lib/shared/schemas';

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const rawData = Object.fromEntries(formData.entries());

		const parseResult = eventSchema.safeParse(rawData);
		if (!parseResult.success) {
			return fail(400, {
				error: 'Bitte fülle alle Pflichtfelder (Titel und Startdatum) korrekt aus.',
				values: rawData
			});
		}

		const {
			title,
			description,
			dateStart,
			dateEnd,
			locationName,
			locationAddress,
			accentColor,
			maxCompanions
		} = parseResult.data;

		const event = createEvent(locals.user!.id, {
			title,
			description,
			dateStart,
			dateEnd,
			locationName,
			locationAddress,
			accentColor,
			maxCompanions
		});

		throw redirect(303, `/events/${event.id}`);
	}
};
