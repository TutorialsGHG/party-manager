import { error, type RequestHandler } from '@sveltejs/kit';
import { findEventById } from '$lib/server/db/repositories/event.repository';
import { generateIcs } from '$lib/features/events/ics';
import { config } from '$lib/server/config/env';

export const GET: RequestHandler = async ({ params, locals }) => {
  const event = findEventById(params.id!);
  if (!event) {
    throw error(404, 'Event nicht gefunden');
  }

  const icsContent = generateIcs({
    id: event.id,
    title: event.title,
    description: event.description,
    locationName: event.locationName,
    locationAddress: event.locationAddress,
    dateStart: event.dateStart,
    dateEnd: event.dateEnd,
    url: `${config.baseUrl}/events/${event.id}`
  });

  return new Response(icsContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="event-${event.id.slice(0, 8)}.ics"`
    }
  });
};