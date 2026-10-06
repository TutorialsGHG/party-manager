import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	findEventById,
	regenerateEventToken,
	deleteEvent,
	updateMaxCompanions
} from '$lib/server/db/repositories/event.repository';
import { getRsvpSummary } from '$lib/server/db/repositories/rsvp.repository';
import { MediaRepository } from '$lib/server/db/repositories/media.repository';
import {
	createWallPost,
	deleteWallPost,
	listWallPosts,
	togglePinWallPost
} from '$lib/server/db/repositories/wall.repository';
import {
	createPoll,
	listPollsForEvent,
	toggleClosePoll
} from '$lib/server/db/repositories/poll.repository';
import { registerGuest, listGuestOverview } from '$lib/server/db/repositories/guest.repository';
import { sseHub } from '$lib/server/realtime/sse-hub';
import { config } from '$lib/server/config/env';
import { mediaQueue } from '$lib/server/media/queue';
import { requireUser } from '$lib/server/auth/require-user';

export const load: PageServerLoad = async ({ params, locals }) => {
	const event = findEventById(params.id!, requireUser(locals).id);
	if (!event) {
		throw error(404, 'Event nicht gefunden oder keine Berechtigung.');
	}

	const rsvp = getRsvpSummary(event.id);
	const mediaItems = MediaRepository.listByEvent(event.id);
	const wallPosts = listWallPosts(event.id);
	const polls = listPollsForEvent(event.id);
	// Guests who never sent an RSVP still matter to the host: they opened the
	// invitation, posted on the wall or uploaded photos. `getRsvpSummary` is driven
	// by the rsvps table and therefore structurally blind to them.
	const guestOverview = listGuestOverview(event.id);
	const baseUrl = config.baseUrl;

	// The invite token hash is an internal lookup key; it must not be serialized
	// into the HTML payload. The plaintext token is only returned on create/regen.
	const { tokenHash: _tokenHash, ...safeEvent } = event;

	return {
		event: safeEvent,
		rsvp,
		guestOverview,
		mediaItems,
		wallPosts,
		polls,
		baseUrl
	};
};

export const actions: Actions = {
	regenerateToken: async ({ params, locals }) => {
		const newToken = regenerateEventToken(params.id!, requireUser(locals).id);
		if (!newToken) {
			return fail(400, { error: 'Link konnte nicht neu generiert werden.' });
		}
		return {
			newToken
		};
	},

	updateMaxCompanions: async ({ request, params, locals }) => {
		const rawValue = String((await request.formData()).get('maxCompanions') || '');
		const maxCompanions = Number(rawValue);
		if (!Number.isInteger(maxCompanions) || maxCompanions < 0 || maxCompanions > 20) {
			return fail(400, { error: 'Bitte wähle eine Anzahl zwischen 0 und 20.' });
		}
		if (!updateMaxCompanions(params.id!, requireUser(locals).id, maxCompanions)) {
			return fail(404, { error: 'Event nicht gefunden oder keine Berechtigung.' });
		}
		sseHub.broadcast(params.id!, 'event:companions', { maxCompanions });
		return { success: true, maxCompanions };
	},

	retryFailedMedia: async ({ params, locals }) => {
		const event = findEventById(params.id!, requireUser(locals).id);
		if (!event) throw error(404, 'Event nicht gefunden oder keine Berechtigung.');

		const failedItems = MediaRepository.listByEvent(event.id).filter(
			(item) => item.status === 'failed'
		);
		for (const item of failedItems) mediaQueue.enqueue(item.id);
		return { success: true, retriedMedia: failedItems.length };
	},

	deleteEvent: async ({ params, locals }) => {
		const success = deleteEvent(params.id!, requireUser(locals).id);
		if (!success) {
			return fail(400, { error: 'Event konnte nicht gelöscht werden.' });
		}
		throw redirect(303, '/dashboard');
	},

	addWallPost: async ({ request, params, locals }) => {
		const event = findEventById(params.id!, requireUser(locals).id);
		if (!event) throw error(404, 'Event nicht gefunden oder keine Berechtigung.');

		const content = String((await request.formData()).get('content') || '').trim();
		if (!content || content.length > 2000) {
			return fail(400, { error: 'Beitrag darf nicht leer sein (max. 2000 Zeichen).' });
		}

		const hostGuest = registerGuest(event.id, `host_${requireUser(locals).id}`, 'Host', true);
		const post = createWallPost(event.id, hostGuest.id, content);
		sseHub.broadcast(event.id, 'wall:new', post);
		return { success: true };
	},

	toggleWallPostPin: async ({ request, params, locals }) => {
		const event = findEventById(params.id!, requireUser(locals).id);
		if (!event) throw error(404, 'Event nicht gefunden oder keine Berechtigung.');

		const postId = String((await request.formData()).get('postId') || '');
		const success = togglePinWallPost(postId, event.id);
		if (success) sseHub.broadcast(event.id, 'wall:update', { postId });
		return { success };
	},

	deleteWallPost: async ({ request, params, locals }) => {
		const event = findEventById(params.id!, requireUser(locals).id);
		if (!event) throw error(404, 'Event nicht gefunden oder keine Berechtigung.');

		const postId = String((await request.formData()).get('postId') || '');
		const success = deleteWallPost(postId, event.id);
		if (success) sseHub.broadcast(event.id, 'wall:delete', { postId });
		return { success };
	},

	createPoll: async ({ request, params, locals }) => {
		const event = findEventById(params.id!, requireUser(locals).id);
		if (!event) throw error(404, 'Event nicht gefunden oder keine Berechtigung.');

		const formData = await request.formData();
		const question = String(formData.get('question') || '').trim();
		const options = formData
			.getAll('option')
			.map(String)
			.map((option) => option.trim())
			.filter(Boolean);
		if (!question || question.length > 300 || options.length < 2 || options.length > 10) {
			return fail(400, {
				error: 'Eine Frage und zwei bis zehn Antwortoptionen sind erforderlich.'
			});
		}

		const poll = createPoll(event.id, {
			question,
			options,
			isMultiple: formData.get('isMultiple') === 'on',
			allowGuestOptions: formData.get('allowGuestOptions') === 'on'
		});
		sseHub.broadcast(event.id, 'poll:update', { pollId: poll.id });
		return { success: true };
	},

	togglePoll: async ({ request, params, locals }) => {
		const event = findEventById(params.id!, requireUser(locals).id);
		if (!event) throw error(404, 'Event nicht gefunden oder keine Berechtigung.');

		const pollId = String((await request.formData()).get('pollId') || '');
		const success = toggleClosePoll(pollId, event.id);
		if (success) sseHub.broadcast(event.id, 'poll:update', { pollId });
		return { success };
	}
};
