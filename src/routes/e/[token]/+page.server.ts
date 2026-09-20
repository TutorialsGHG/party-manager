import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import crypto from 'node:crypto';
import { findEventByToken } from '$lib/server/db/repositories/event.repository';
import {
  findGuestByDeviceToken,
  registerGuest
} from '$lib/server/db/repositories/guest.repository';
import {
  findRsvpByGuestId,
  upsertRsvp,
  getRsvpSummary
} from '$lib/server/db/repositories/rsvp.repository';
import { rsvpSchema } from '$lib/shared/schemas';

const GUEST_COOKIE_PREFIX = 'dev_tok_';

export const load: PageServerLoad = async ({ params, cookies, setHeaders }) => {
  // Prevent indexing of private invite pages
  setHeaders({
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  });

  const event = findEventByToken(params.token);
  if (!event) {
    throw error(404, 'Einladung nicht gefunden oder Link ist abgelaufen.');
  }

  // Check or initialize guest device token cookie
  const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
  let deviceToken = cookies.get(cookieName);

  if (!deviceToken) {
    deviceToken = crypto.randomBytes(24).toString('base64url');
    cookies.set(cookieName, deviceToken, {
      path: `/e/${params.token}`,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 // 1 year
    });
  }

  const currentGuest = findGuestByDeviceToken(event.id, deviceToken);
  const rsvp = currentGuest ? findRsvpByGuestId(event.id, currentGuest.id) : null;
  const summary = getRsvpSummary(event.id);

  return {
    event,
    currentGuest,
    rsvp,
    summary
  };
};

export const actions: Actions = {
  setName: async ({ request, params, cookies }) => {
    const event = findEventByToken(params.token);
    if (!event) throw error(404, 'Event nicht gefunden.');

    const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
    let deviceToken = cookies.get(cookieName);
    if (!deviceToken) {
      deviceToken = crypto.randomBytes(24).toString('base64url');
      cookies.set(cookieName, deviceToken, {
        path: `/e/${params.token}`,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60
      });
    }

    const formData = await request.formData();
    const name = String(formData.get('name') || '').trim();

    if (!name || name.length > 50) {
      return fail(400, { error: 'Bitte gib einen Namen ein (max. 50 Zeichen).' });
    }

    const guest = registerGuest(event.id, deviceToken, name);
    return { success: true, guest };
  },

  submitRsvp: async ({ request, params, cookies }) => {
    const event = findEventByToken(params.token);
    if (!event) throw error(404, 'Event nicht gefunden.');

    const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
    const deviceToken = cookies.get(cookieName);
    if (!deviceToken) throw error(400, 'Kein Gerätezugriff.');

    let guest = findGuestByDeviceToken(event.id, deviceToken);
    const formData = await request.formData();
    const rawData = Object.fromEntries(formData.entries());

    // If guest name was submitted simultaneously
    const submittedName = String(rawData.name || '').trim();
    if (!guest && submittedName) {
      guest = registerGuest(event.id, deviceToken, submittedName);
    }

    if (!guest) {
      return fail(400, { error: 'Bitte gib zuerst deinen Namen ein.' });
    }

    const parsed = rsvpSchema.safeParse(rawData);
    if (!parsed.success) {
      return fail(400, { error: 'Ungültige Rückmeldungsdaten.' });
    }

    const rsvp = upsertRsvp(event.id, guest.id, parsed.data);
    return { success: true, rsvp };
  }
};