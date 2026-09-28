import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MediaRepository } from '$lib/server/db/repositories/media.repository.js';
import { findEventById } from '$lib/server/db/repositories/event.repository.js';
import { findGuestByDeviceToken } from '$lib/server/db/repositories/guest.repository.js';
import { readBlobAsPlaintext } from '$lib/server/storage/blob-store.js';

export const GET: RequestHandler = async ({ params, request, locals, cookies }) => {
	const mediaId = params.id;
	const media = MediaRepository.getById(mediaId);
	if (!media) {
		throw error(404, 'Media not found');
	}

	// Authorization check
	let authorized = false;
	if (locals.user) {
		const hostEvent = findEventById(media.eventId, locals.user.id);
		if (hostEvent) authorized = true;
	}

	if (!authorized) {
		const cookieName = `dev_tok_${media.eventId.slice(0, 8)}`;
		const guestToken = request.headers.get('x-guest-token') || cookies.get(cookieName);
		if (guestToken && findGuestByDeviceToken(media.eventId, guestToken)) {
			authorized = true;
		}
	}

	if (!authorized) {
		throw error(401, 'Unauthorized');
	}

	const keys = MediaRepository.getMediaKeys(mediaId);
	if (!keys) {
		throw error(404, 'Media keys not found');
	}

	const originalPlaintext = readBlobAsPlaintext(
		mediaId,
		keys.fileKey,
		keys.totalPlaintextSize,
		'original'
	);

	const safeFilename = encodeURIComponent(media.originalFilename || `download-${mediaId}`);

	return new Response(new Uint8Array(originalPlaintext), {
		status: 200,
		headers: {
			'Content-Type': media.mimeType || 'application/octet-stream',
			'Content-Length': String(originalPlaintext.length),
			'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
			'Cache-Control': 'private, no-cache'
		}
	});
};
