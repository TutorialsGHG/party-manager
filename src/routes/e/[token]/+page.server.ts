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
import {
  createWallPost,
  listWallPosts,
  deleteWallPost
} from '$lib/server/db/repositories/wall.repository';
import {
  listPollsForEvent,
  votePoll,
  addPollOption
} from '$lib/server/db/repositories/poll.repository';
import { sseHub } from '$lib/server/realtime/sse-hub';
import { rsvpSchema, wallPostSchema } from '$lib/shared/schemas';

const GUEST_COOKIE_PREFIX = 'dev_tok_';

export const load: PageServerLoad = async ({ params, cookies, setHeaders }) => {
  setHeaders({
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  });

  const event = findEventByToken(params.token);
  if (!event) {
    throw error(404, 'Einladung nicht gefunden oder Link ist abgelaufen.');
  }

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

  const currentGuest = findGuestByDeviceToken(event.id, deviceToken);
  const rsvp = currentGuest ? findRsvpByGuestId(event.id, currentGuest.id) : null;
  const summary = getRsvpSummary(event.id);
  const wallPosts = listWallPosts(event.id);
  const polls = listPollsForEvent(event.id, currentGuest?.id);

  return {
    event,
    currentGuest,
    rsvp,
    summary,
    wallPosts,
    polls
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
    sseHub.broadcast(event.id, 'rsvp:update', { guestId: guest.id, status: parsed.data.status });
    return { success: true, rsvp };
  },

  addWallPost: async ({ request, params, cookies }) => {
    const event = findEventByToken(params.token);
    if (!event) throw error(404, 'Event nicht gefunden.');

    const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
    const deviceToken = cookies.get(cookieName);
    const guest = deviceToken ? findGuestByDeviceToken(event.id, deviceToken) : null;
    if (!guest) return fail(400, { error: 'Bitte gib zuerst deinen Namen ein.' });

    const formData = await request.formData();
    const content = String(formData.get('content') || '').trim();
    if (!content || content.length > 2000) {
      return fail(400, { error: 'Beitrag darf nicht leer sein (max. 2000 Zeichen).' });
    }

    const post = createWallPost(event.id, guest.id, content);
    sseHub.broadcast(event.id, 'wall:new', post);
    return { success: true, post };
  },

  deleteWallPost: async ({ request, params, cookies }) => {
    const event = findEventByToken(params.token);
    if (!event) throw error(404, 'Event nicht gefunden.');

    const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
    const deviceToken = cookies.get(cookieName);
    const guest = deviceToken ? findGuestByDeviceToken(event.id, deviceToken) : null;
    if (!guest) return fail(400, { error: 'Keine Berechtigung.' });

    const formData = await request.formData();
    const postId = String(formData.get('postId') || '');

    const deleted = deleteWallPost(postId, event.id, guest.id);
    if (deleted) {
      sseHub.broadcast(event.id, 'wall:delete', { postId });
    }
    return { success: deleted };
  },

  votePoll: async ({ request, params, cookies }) => {
    const event = findEventByToken(params.token);
    if (!event) throw error(404, 'Event nicht gefunden.');

    const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
    const deviceToken = cookies.get(cookieName);
    const guest = deviceToken ? findGuestByDeviceToken(event.id, deviceToken) : null;
    if (!guest) return fail(400, { error: 'Bitte gib zuerst deinen Namen ein.' });

    const formData = await request.formData();
    const pollId = String(formData.get('pollId') || '');
    const optionIds = formData.getAll('optionId').map(String);

    const success = votePoll(pollId, guest.id, optionIds);
    if (success) {
      sseHub.broadcast(event.id, 'poll:vote', { pollId });
    }
    return { success };
  },

  addPollOption: async ({ request, params, cookies }) => {
    const event = findEventByToken(params.token);
    if (!event) throw error(404, 'Event nicht gefunden.');

    const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
    const deviceToken = cookies.get(cookieName);
    const guest = deviceToken ? findGuestByDeviceToken(event.id, deviceToken) : null;
    if (!guest) return fail(400, { error: 'Bitte gib zuerst deinen Namen ein.' });

    const formData = await request.formData();
    const pollId = String(formData.get('pollId') || '');
    const text = String(formData.get('text') || '').trim();

    if (!text || text.length > 100) {
      return fail(400, { error: 'Ungültiger Optionstext.' });
    }

    const opt = addPollOption(pollId, event.id, text, guest.id);
    sseHub.broadcast(event.id, 'poll:update', { pollId });
    return { success: true, opt };
  }
};