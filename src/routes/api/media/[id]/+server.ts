import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MediaRepository } from '$lib/server/db/repositories/media.repository.js';
import { findEventById } from '$lib/server/db/repositories/event.repository.js';
import { findGuestByDeviceToken } from '$lib/server/db/repositories/guest.repository.js';
import { sseHub } from '$lib/server/realtime/sse-hub.js';

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const mediaId = params.id;
	const media = MediaRepository.getById(mediaId);
	if (!media) {
		throw error(404, 'Media not found');
	}

	let allowed = false;

	// 1. Host check
	if (locals.user) {
		const hostEvent = findEventById(media.eventId, locals.user.id);
		if (hostEvent) allowed = true;
	}

	// 2. Uploader guest check
	if (!allowed) {
		const cookieName = `dev_tok_${media.eventId.slice(0, 8)}`;
		const guestToken = request.headers.get('x-guest-token') || cookies.get(cookieName);
		if (guestToken) {
			const guest = findGuestByDeviceToken(media.eventId, guestToken);
			if (guest && guest.id === media.uploaderGuestId) {
				allowed = true;
			}
		}
	}

	if (!allowed) {
		throw error(403, 'Forbidden: cannot delete this media');
	}

	const eventId = MediaRepository.deleteMedia(mediaId);
	if (eventId) {
		sseHub.broadcast(eventId, 'media:delete', { mediaId });
	}

	return json({ success: true, mediaId });
};
