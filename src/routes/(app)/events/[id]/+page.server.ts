import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  findEventById,
  regenerateEventToken,
  deleteEvent
} from '$lib/server/db/repositories/event.repository';
import { getRsvpSummary } from '$lib/server/db/repositories/rsvp.repository';
import { MediaRepository } from '$lib/server/db/repositories/media.repository';
import { generateQrSvg } from '$lib/features/events/qr';
import { config } from '$lib/server/config/env';

export const load: PageServerLoad = async ({ params, locals }) => {
  const event = findEventById(params.id!, locals.user!.id);
  if (!event) {
    throw error(404, 'Event nicht gefunden oder keine Berechtigung.');
  }

  const rsvp = getRsvpSummary(event.id);
  const mediaItems = MediaRepository.listByEvent(event.id);
  const baseUrl = config.baseUrl;

  return {
    event,
    rsvp,
    mediaItems,
    baseUrl
  };
};

export const actions: Actions = {
  regenerateToken: async ({ params, locals }) => {
    const newToken = regenerateEventToken(params.id!, locals.user!.id);
    if (!newToken) {
      return fail(400, { error: 'Link konnte nicht neu generiert werden.' });
    }
    return {
      newToken
    };
  },

  deleteEvent: async ({ params, locals }) => {
    const success = deleteEvent(params.id!, locals.user!.id);
    if (!success) {
      return fail(400, { error: 'Event konnte nicht gelöscht werden.' });
    }
    throw redirect(303, '/dashboard');
  }
};