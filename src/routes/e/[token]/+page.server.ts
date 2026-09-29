import { error, fail } from '@sveltejs/kit';
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
	addPollOption,
	isPollInEvent
} from '$lib/server/db/repositories/poll.repository';
import { sseHub } from '$lib/server/realtime/sse-hub';
import { rsvpSchema } from '$lib/shared/schemas';
import { MediaRepository } from '$lib/server/db/repositories/media.repository';
import {
	claimCompanionInvite,
	findAvailableCompanionInvite,
	getOrCreateCompanionInvite,
	listCompanionInvitesForOwner
} from '$lib/server/db/repositories/companion-invite.repository';

const GUEST_COOKIE_PREFIX = 'dev_tok_';
const COMPANION_COOKIE_PREFIX = 'comp_inv_';

export const load: PageServerLoad = async ({ params, url, cookies, setHeaders }) => {
	setHeaders({
		'X-Robots-Tag': 'noindex, nofollow, noarchive'
	});

	const event = findEventByToken(params.token);
	if (!event) {
		throw error(404, 'Einladung nicht gefunden oder Link ist abgelaufen.');
	}

	const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
	let deviceToken = cookies.get(cookieName);

	const companionToken =
		url.searchParams.get('companion') ||
		cookies.get(`${COMPANION_COOKIE_PREFIX}${event.id.slice(0, 8)}`);
	const companionInvite = companionToken
		? findAvailableCompanionInvite(event.id, companionToken)
		: null;
	if (companionToken && companionInvite) {
		cookies.set(`${COMPANION_COOKIE_PREFIX}${event.id.slice(0, 8)}`, companionToken, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 30 * 24 * 60 * 60
		});
	}

	if (!deviceToken) {
		deviceToken = crypto.randomBytes(24).toString('base64url');
		cookies.set(cookieName, deviceToken, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 365 * 24 * 60 * 60
		});
	}

	let currentGuest = findGuestByDeviceToken(event.id, deviceToken);
	if (!currentGuest && companionToken && companionInvite) {
		currentGuest = registerGuest(
			event.id,
			deviceToken,
			companionInvite.name,
			false,
			companionInvite.id
		);
		claimCompanionInvite(event.id, companionToken, currentGuest.id);
		cookies.delete(`${COMPANION_COOKIE_PREFIX}${event.id.slice(0, 8)}`, { path: '/' });
	}
	const rsvp = currentGuest ? findRsvpByGuestId(event.id, currentGuest.id) : null;
	const companionInvites =
		currentGuest && rsvp?.status === 'yes'
			? listCompanionInvitesForOwner(event.id, currentGuest.id)
			: [];
	const summary = getRsvpSummary(event.id);
	const wallPosts = listWallPosts(event.id);
	const polls = listPollsForEvent(event.id, currentGuest?.id);
	const mediaItems = MediaRepository.listByEvent(event.id).filter((m) => m.status === 'ready');

	return {
		event,
		inviteToken: params.token,
		currentGuest,
		deviceToken,
		rsvp,
		companionInvites,
		summary,
		wallPosts,
		polls,
		mediaItems
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
				path: '/',
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

		const companionToken = cookies.get(`${COMPANION_COOKIE_PREFIX}${event.id.slice(0, 8)}`);
		const companionInvite = companionToken
			? findAvailableCompanionInvite(event.id, companionToken)
			: null;
		const guest = registerGuest(event.id, deviceToken, name, false, companionInvite?.id);
		if (
			companionToken &&
			companionInvite &&
			claimCompanionInvite(event.id, companionToken, guest.id)
		) {
			cookies.delete(`${COMPANION_COOKIE_PREFIX}${event.id.slice(0, 8)}`, { path: '/' });
		}
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

		if (guest.isCompanion) {
			return fail(403, { error: 'Begleitpersonen können keine eigene Rückmeldung abgeben.' });
		}

		const parsed = rsvpSchema.safeParse(rawData);
		if (!parsed.success) {
			return fail(400, { error: 'Ungültige Rückmeldungsdaten.' });
		}

		const rsvp = upsertRsvp(event.id, guest.id, {
			...parsed.data,
			companionCount:
				parsed.data.status === 'yes'
					? Math.min(Math.max(0, parsed.data.companionCount), event.maxCompanions)
					: 0,
			companionNames: parsed.data.companionNames
		});

		if (parsed.data.status === 'yes' && rsvp.companionCount > 0) {
			const companionName = parsed.data.companionNames?.trim() || 'Begleitperson';
			getOrCreateCompanionInvite(event.id, guest.id, companionName);
		}

		sseHub.broadcast(event.id, 'rsvp:update', { guestId: guest.id, status: parsed.data.status });
		return { success: true, rsvp };
	},

	createCompanionInvite: async ({ request, params, cookies }) => {
		const event = findEventByToken(params.token);
		if (!event) throw error(404, 'Event nicht gefunden.');

		const deviceToken = cookies.get(`${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`);
		const guest = deviceToken ? findGuestByDeviceToken(event.id, deviceToken) : null;
		const rsvp = guest ? findRsvpByGuestId(event.id, guest.id) : null;
		if (!guest || guest.isCompanion || rsvp?.status !== 'yes') {
			return fail(403, { error: 'Nur zusagende Hauptgäste können Begleitlinks erstellen.' });
		}

		const formData = await request.formData();
		const companionName =
			String(formData.get('companionName') || '').trim() ||
			rsvp.companionNames?.trim() ||
			'Begleitperson';

		const companionToken = getOrCreateCompanionInvite(event.id, guest.id, companionName);
		return { success: true, companionToken };
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

		const success = votePoll(pollId, guest.id, optionIds, event.id);
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

		// Reject polls from other events (IDOR: cross-event option injection).
		// The repository enforces the same invariant, so a null result is handled
		// here too rather than being dereferenced.
		if (!isPollInEvent(pollId, event.id)) {
			return fail(404, { error: 'Umfrage nicht gefunden.' });
		}

		const opt = addPollOption(pollId, event.id, text, guest.id);
		if (!opt) {
			return fail(404, { error: 'Umfrage nicht gefunden.' });
		}
		sseHub.broadcast(event.id, 'poll:update', { pollId });
		return { success: true, opt };
	}
};
