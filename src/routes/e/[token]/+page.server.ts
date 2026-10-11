import { error, fail, type ActionFailure } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import crypto from 'node:crypto';
import { findEventByToken } from '$lib/server/db/repositories/event.repository';
import {
	findGuestByDeviceToken,
	registerGuest,
	type GuestData
} from '$lib/server/db/repositories/guest.repository';
import {
	findRsvpByGuestId,
	upsertRsvp,
	getRsvpSummary
} from '$lib/server/db/repositories/rsvp.repository';
import { listAnnouncements } from '$lib/server/db/repositories/announcement.repository';
import { guestSeesAnnouncements } from '$lib/server/announcements/audience';
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
import {
	listPotluckItems,
	createPotluckItem,
	claimPotluckItem,
	unclaimPotluckItem,
	deletePotluckItem
} from '$lib/server/db/repositories/potluck.repository';
import { sseHub } from '$lib/server/realtime/sse-hub';
import { GUEST_COOKIE_OPTIONS } from '$lib/server/auth/session';
import { rsvpSchema } from '$lib/shared/schemas';
import { MediaRepository } from '$lib/server/db/repositories/media.repository';
import {
	claimCompanionInvite,
	findAvailableCompanionInvite,
	getOrCreateCompanionInvite,
	listCompanionInvitesForOwner
} from '$lib/server/db/repositories/companion-invite.repository';
import {
	checkGuestRateLimit,
	recordGuestAttempt,
	type GuestBudget
} from '$lib/server/auth/guest-rate-limit';

const GUEST_COOKIE_PREFIX = 'dev_tok_';
const COMPANION_COOKIE_PREFIX = 'comp_inv_';

/**
 * Resolves the guest for a mutating action on the public invitation page and applies
 * the per-device abuse throttle (Tier 1 hardening).
 *
 * Every guest action used to be unthrottled, so anyone holding an invite link could
 * script wall posts, poll votes and RSVP changes without limit. The throttle is keyed
 * on the device token rather than the IP, because all guests of one school share a
 * single public IP and a per-IP limit would lock out the whole audience.
 *
 * Returns a discriminated union so callers narrow via `if (!auth.ok)` and get a
 * non-null `guest` without an assertion. Call `recordGuestAttempt` only after the
 * action actually performed the mutation, so a rejected submission does not consume
 * the guest's budget.
 *
 * `limit` defaults to GUEST_WRITE_MAX; heavier actions (upload session creation) pass
 * the tighter GUEST_UPLOAD_MAX. Both counters are recorded in the same table, so a
 * single call records against whichever budget the caller checked.
 *
 * `failure` is typed as ActionFailure<unknown> rather than a concrete `fail()`
 * return on purpose: annotating it with the union of every action's payload made
 * SvelteKit infer `form` as `{}` for the whole page, which broke the companion-token
 * read in +page.svelte. Spreading `auth.failure` keeps each action's own payload
 * shape intact.
 */
type GuestAuthResult =
	| { ok: true; guest: GuestData; deviceToken: string }
	| { ok: false; failure: ActionFailure<{ error: string }> };

async function authorizeGuestAction(
	eventId: string,
	cookies: { get: (name: string) => string | undefined },
	deviceToken: string | undefined,
	budget: GuestBudget = 'write'
): Promise<GuestAuthResult> {
	const token = deviceToken || cookies.get(`${GUEST_COOKIE_PREFIX}${eventId.slice(0, 8)}`);
	if (!token) {
		return { ok: false, failure: fail(400, { error: 'Kein Gerätezugriff.' }) };
	}

	const rateLimit = checkGuestRateLimit(eventId, token, budget);
	if (rateLimit.blocked) {
		return {
			ok: false,
			failure: fail(429, {
				error: `Zu viele Aktionen. Bitte in ${Math.ceil(
					rateLimit.retryAfterSeconds / 60
				)} Minuten erneut versuchen.`
			})
		};
	}

	const guest = findGuestByDeviceToken(eventId, token);
	if (!guest) {
		return { ok: false, failure: fail(403, { error: 'Keine Berechtigung.' }) };
	}

	return { ok: true, guest, deviceToken: token };
}

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
			...GUEST_COOKIE_OPTIONS,
			maxAge: 30 * 24 * 60 * 60
		});
	}

	if (!deviceToken) {
		deviceToken = crypto.randomBytes(24).toString('base64url');
		cookies.set(cookieName, deviceToken, {
			...GUEST_COOKIE_OPTIONS,
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
	const wallPosts = event.showWall ? listWallPosts(event.id) : [];
	const polls = event.showPolls ? listPollsForEvent(event.id, currentGuest?.id) : [];
	const mediaItems = event.showGallery
		? MediaRepository.listByEvent(event.id).filter((m) => m.status === 'ready')
		: [];

	// Announcements are addressed to the guests who confirmed ("bring drinks by
	// Friday"). The filter runs on the server, not in the template: a guest who
	// declined must not receive the content at all, otherwise it would still travel
	// to their browser in the page payload.
	//
	// The predicate lives in lib/server/announcements/audience.ts and is shared with the
	// SSE route, so the page load and the live channel cannot drift apart again.
	const announcements = guestSeesAnnouncements(event.id, currentGuest)
		? listAnnouncements(event.id)
		: [];
	const potluckItems = event.showPotluck ? listPotluckItems(event.id) : [];

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
		mediaItems,
		announcements,
		potluckItems
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
				...GUEST_COOKIE_OPTIONS,
				maxAge: 365 * 24 * 60 * 60
			});
		}

		// Throttled because this is the entry point that mints the guest row, and
		// registerGuest() is only idempotent per device token. A client that keeps its
		// cookie re-uses one guest; a client that discards cookies gets a fresh token and
		// therefore a fresh guest row per request.
		//
		// Known limitation, stated rather than papered over: that second case is not
		// actually bounded by this check, because each cookie-less request also gets a
		// new counter key. Closing it would require an identity that survives a missing
		// cookie, and the only candidates are IP (locks out an entire school behind one
		// NAT address - the reason this whole module keys on device tokens) or a
		// proof-of-work challenge. For a self-hosted party app the guest row is a single
		// small insert, so the residual cost is disk rows, not data exposure; the
		// mutation paths that actually matter (RSVP, wall, polls, uploads) all require
		// the existing guest and are bounded.
		const nameRateLimit = checkGuestRateLimit(event.id, deviceToken);
		if (nameRateLimit.blocked) {
			return fail(429, {
				error: `Zu viele Aktionen. Bitte in ${Math.ceil(
					nameRateLimit.retryAfterSeconds / 60
				)} Minuten erneut versuchen.`
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

		// Counted after the guest was written, so a rejected name does not burn budget.
		recordGuestAttempt(event.id, deviceToken);
		return { success: true, guest };
	},

	submitRsvp: async ({ request, params, cookies }) => {
		const event = findEventByToken(params.token);
		if (!event) throw error(404, 'Event nicht gefunden.');

		const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
		const deviceToken = cookies.get(cookieName);
		if (!deviceToken) throw error(400, 'Kein Gerätezugriff.');

		// Throttle before the guest is created. This action is the cheapest to script
		// (a POST of four fields) and it is also the entry point that mints a guest row,
		// so leaving it open would let a single device enrol unlimited guests and churn
		// the RSVP table. `authorizeGuestAction` cannot be reused here because it
		// requires an existing guest, and this action is what creates it.
		const rsvpRateLimit = checkGuestRateLimit(event.id, deviceToken);
		if (rsvpRateLimit.blocked) {
			return fail(429, {
				error: `Zu viele Aktionen. Bitte in ${Math.ceil(
					rsvpRateLimit.retryAfterSeconds / 60
				)} Minuten erneut versuchen.`
			});
		}

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

		// Recorded only after the RSVP was actually written, so a rejected or malformed
		// submission does not consume the guest's budget.
		recordGuestAttempt(event.id, deviceToken);

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

		// Throttled, but without consuming budget: getOrCreateCompanionInvite is
		// idempotent per guest, so a repeat call is a read, not new abuse. The check
		// still stops a guest who is already over budget from hammering the action.
		const inviteRateLimit = checkGuestRateLimit(event.id, deviceToken!);
		if (inviteRateLimit.blocked) {
			return fail(429, {
				error: `Zu viele Aktionen. Bitte in ${Math.ceil(
					inviteRateLimit.retryAfterSeconds / 60
				)} Minuten erneut versuchen.`
			});
		}

		const companionToken = getOrCreateCompanionInvite(event.id, guest.id, companionName);
		return { success: true, companionToken };
	},

	addWallPost: async ({ request, params, cookies }) => {
		const event = findEventByToken(params.token);
		if (!event) throw error(404, 'Event nicht gefunden.');
		if (!event.showWall) {
			return fail(403, { error: 'Pinnwand ist für dieses Event deaktiviert.' });
		}

		const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
		const deviceToken = cookies.get(cookieName);
		const auth = await authorizeGuestAction(event.id, cookies, deviceToken);
		if (!auth.ok) return auth.failure;

		const formData = await request.formData();
		const content = String(formData.get('content') || '').trim();
		if (!content || content.length > 2000) {
			return fail(400, { error: 'Beitrag darf nicht leer sein (max. 2000 Zeichen).' });
		}

		const post = createWallPost(event.id, auth.guest.id, content);
		recordGuestAttempt(event.id, auth.deviceToken);
		sseHub.broadcast(event.id, 'wall:new', post);
		return { success: true, post };
	},

	deleteWallPost: async ({ request, params, cookies }) => {
		const event = findEventByToken(params.token);
		if (!event) throw error(404, 'Event nicht gefunden.');
		if (!event.showWall) {
			return fail(403, { error: 'Pinnwand ist für dieses Event deaktiviert.' });
		}

		const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
		const deviceToken = cookies.get(cookieName);
		const auth = await authorizeGuestAction(event.id, cookies, deviceToken);
		if (!auth.ok) return auth.failure;

		const formData = await request.formData();
		const postId = String(formData.get('postId') || '');

		const deleted = deleteWallPost(postId, event.id, auth.guest.id);
		if (deleted) {
			recordGuestAttempt(event.id, auth.deviceToken);
			sseHub.broadcast(event.id, 'wall:delete', { postId });
		}
		return { success: deleted };
	},

	votePoll: async ({ request, params, cookies }) => {
		const event = findEventByToken(params.token);
		if (!event) throw error(404, 'Event nicht gefunden.');
		if (!event.showPolls) {
			return fail(403, { error: 'Umfragen sind für dieses Event deaktiviert.' });
		}

		const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
		const deviceToken = cookies.get(cookieName);
		const auth = await authorizeGuestAction(event.id, cookies, deviceToken);
		if (!auth.ok) return auth.failure;

		const formData = await request.formData();
		const pollId = String(formData.get('pollId') || '');
		const optionIds = formData.getAll('optionId').map(String);

		const success = votePoll(pollId, auth.guest.id, optionIds, event.id);
		if (success) {
			recordGuestAttempt(event.id, auth.deviceToken);
			sseHub.broadcast(event.id, 'poll:vote', { pollId });
		}
		return { success };
	},

	addPollOption: async ({ request, params, cookies }) => {
		const event = findEventByToken(params.token);
		if (!event) throw error(404, 'Event nicht gefunden.');
		if (!event.showPolls) {
			return fail(403, { error: 'Umfragen sind für dieses Event deaktiviert.' });
		}

		const cookieName = `${GUEST_COOKIE_PREFIX}${event.id.slice(0, 8)}`;
		const deviceToken = cookies.get(cookieName);
		const auth = await authorizeGuestAction(event.id, cookies, deviceToken);
		if (!auth.ok) return auth.failure;

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

		const opt = addPollOption(pollId, event.id, text, auth.guest.id);
		if (!opt) {
			return fail(404, { error: 'Umfrage nicht gefunden.' });
		}
		recordGuestAttempt(event.id, auth.deviceToken);
		sseHub.broadcast(event.id, 'poll:update', { pollId });
		return { success: true, opt };
	},

	addPotluckItem: async ({ request, params, cookies }) => {
		const event = findEventByToken(params.token);
		if (!event) throw error(404, 'Event nicht gefunden.');
		if (!event.showPotluck) {
			return fail(403, { error: 'Mitbringliste ist für dieses Event deaktiviert.' });
		}

		const auth = await authorizeGuestAction(event.id, cookies, undefined, 'write');
		if (!auth.ok) return auth.failure;

		const formData = await request.formData();
		const title = String(formData.get('title') || '').trim();
		if (!title || title.length > 100) {
			return fail(400, {
				error: 'Bitte gib einen Namen für das Mitbringsel ein (max. 100 Zeichen).'
			});
		}

		const item = createPotluckItem(event.id, title, auth.guest.id);
		recordGuestAttempt(event.id, auth.deviceToken, 'write');
		sseHub.broadcast(event.id, 'potluck:new', item);

		return { success: true };
	},

	claimPotluckItem: async ({ request, params, cookies }) => {
		const event = findEventByToken(params.token);
		if (!event) throw error(404, 'Event nicht gefunden.');
		if (!event.showPotluck) {
			return fail(403, { error: 'Mitbringliste ist für dieses Event deaktiviert.' });
		}

		const auth = await authorizeGuestAction(event.id, cookies, undefined, 'write');
		if (!auth.ok) return auth.failure;

		const formData = await request.formData();
		const itemId = String(formData.get('itemId') || '');
		if (!itemId) {
			return fail(400, { error: 'Eintrags-ID fehlt.' });
		}

		const item = claimPotluckItem(event.id, itemId, auth.guest.id, auth.guest.name);
		if (!item) {
			return fail(400, {
				error: 'Eintrag konnte nicht reserviert werden oder ist bereits vergeben.'
			});
		}
		recordGuestAttempt(event.id, auth.deviceToken, 'write');
		sseHub.broadcast(event.id, 'potluck:update', item);

		return { success: true };
	},

	unclaimPotluckItem: async ({ request, params, cookies }) => {
		const event = findEventByToken(params.token);
		if (!event) throw error(404, 'Event nicht gefunden.');
		if (!event.showPotluck) {
			return fail(403, { error: 'Mitbringliste ist für dieses Event deaktiviert.' });
		}

		const auth = await authorizeGuestAction(event.id, cookies, undefined, 'write');
		if (!auth.ok) return auth.failure;

		const formData = await request.formData();
		const itemId = String(formData.get('itemId') || '');
		if (!itemId) {
			return fail(400, { error: 'Eintrags-ID fehlt.' });
		}

		const item = unclaimPotluckItem(event.id, itemId, auth.guest.id, false);
		if (!item) {
			return fail(400, { error: 'Zusage konnte nicht zurückgezogen werden.' });
		}
		recordGuestAttempt(event.id, auth.deviceToken, 'write');
		sseHub.broadcast(event.id, 'potluck:update', item);

		return { success: true };
	},

	deletePotluckItem: async ({ request, params, cookies }) => {
		const event = findEventByToken(params.token);
		if (!event) throw error(404, 'Event nicht gefunden.');
		if (!event.showPotluck) {
			return fail(403, { error: 'Mitbringliste ist für dieses Event deaktiviert.' });
		}

		const auth = await authorizeGuestAction(event.id, cookies, undefined, 'write');
		if (!auth.ok) return auth.failure;

		const formData = await request.formData();
		const itemId = String(formData.get('itemId') || '');
		if (!itemId) {
			return fail(400, { error: 'Eintrags-ID fehlt.' });
		}

		const deleted = deletePotluckItem(event.id, itemId, auth.guest.id, false);
		if (!deleted) {
			return fail(403, { error: 'Nur der Ersteller kann diesen Eintrag löschen.' });
		}
		recordGuestAttempt(event.id, auth.deviceToken, 'write');
		sseHub.broadcast(event.id, 'potluck:delete', { id: itemId });

		return { success: true };
	}
};
