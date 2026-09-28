import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MediaRepository } from '$lib/server/db/repositories/media.repository.js';
import { findEventById } from '$lib/server/db/repositories/event.repository.js';
import { findGuestByDeviceToken } from '$lib/server/db/repositories/guest.repository.js';
import {
	blobExists,
	readBlobAsPlaintext,
	getBlobDiskSize
} from '$lib/server/storage/blob-store.js';

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

	// If thumbnail variant exists
	if (blobExists(mediaId, 'thumb')) {
		// Determine plaintext size: each chunk overhead is 28 bytes
		// For thumbnail, total size is diskSize - 28 (since thumbnail fits in a single <1MB chunk)
		const diskSize = getBlobDiskSize(mediaId, 'thumb');
		const thumbPlainSize = Math.max(0, diskSize - 28);
		const thumbBuffer = readBlobAsPlaintext(mediaId, keys.fileKey, thumbPlainSize, 'thumb');

		return new Response(new Uint8Array(thumbBuffer), {
			status: 200,
			headers: {
				'Content-Type': 'image/webp',
				'Content-Length': String(thumbBuffer.length),
				'Cache-Control': 'private, max-age=3600'
			}
		});
	}

	// Fallback to streaming original / web
	const plainBuffer = readBlobAsPlaintext(
		mediaId,
		keys.fileKey,
		media.processedSize || keys.totalPlaintextSize,
		blobExists(mediaId, 'web') ? 'web' : 'original'
	);

	return new Response(new Uint8Array(plainBuffer), {
		status: 200,
		headers: {
			'Content-Type': media.mimeType || 'image/jpeg',
			'Content-Length': String(plainBuffer.length),
			'Cache-Control': 'private, max-age=3600'
		}
	});
};
