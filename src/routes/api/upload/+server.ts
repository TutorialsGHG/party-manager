import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TusServer, parseTusMetadata } from '$lib/server/storage/tus.js';
import { findEventById } from '$lib/server/db/repositories/event.repository.js';
import {
	findGuestByDeviceToken,
	registerGuest
} from '$lib/server/db/repositories/guest.repository.js';
import { SettingsRepository } from '$lib/server/db/repositories/settings.repository.js';
import { MediaRepository } from '$lib/server/db/repositories/media.repository.js';

const TUS_VERSION = '1.0.0';
const MAX_UPLOAD_SIZE = 1024 * 1024 * 1024; // 1 GiB

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 204,
		headers: {
			'Tus-Resumable': TUS_VERSION,
			'Tus-Version': TUS_VERSION,
			'Tus-Extension': 'creation,termination',
			'Tus-Max-Size': String(MAX_UPLOAD_SIZE),
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers':
				'Upload-Length, Upload-Offset, Upload-Metadata, Tus-Resumable, Content-Type, Authorization, X-Guest-Token'
		}
	});
};

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const uploadLengthHeader = request.headers.get('upload-length');
	if (!uploadLengthHeader) {
		throw error(400, 'Missing Upload-Length header.');
	}

	const totalSize = parseInt(uploadLengthHeader, 10);
	if (isNaN(totalSize) || totalSize <= 0) {
		throw error(400, 'Invalid Upload-Length.');
	}

	const settings = SettingsRepository.getAllSettings();
	const maxLimitBytes = settings.maxUploadSizeMb * 1024 * 1024;
	if (totalSize > maxLimitBytes) {
		throw error(413, `File size exceeds maximum upload limit of ${settings.maxUploadSizeMb} MB.`);
	}

	const metadataHeader = request.headers.get('upload-metadata');
	const metadata = parseTusMetadata(metadataHeader);

	const eventId = metadata.eventId;
	if (!eventId) {
		throw error(400, 'Missing eventId in Upload-Metadata.');
	}

	const filename = metadata.filename || 'uploaded-media';
	const mimeType = metadata.filetype || 'application/octet-stream';

	let uploaderGuestId: string | null = null;

	// 1. Check if authenticated host
	if (locals.user) {
		const hostEvent = findEventById(eventId, locals.user.id);
		if (hostEvent) {
			const hostGuest = registerGuest(eventId, `host_${locals.user.id}`, 'Host', true);
			uploaderGuestId = hostGuest.id;
		}
	}

	// 2. Check if authorized guest via token
	if (!uploaderGuestId) {
		const cookieName = `dev_tok_${eventId.slice(0, 8)}`;
		const guestToken =
			metadata.guestToken || request.headers.get('x-guest-token') || cookies.get(cookieName);

		if (guestToken) {
			const guest = findGuestByDeviceToken(eventId, guestToken);
			if (guest) {
				uploaderGuestId = guest.id;
			}
		}
	}

	if (!uploaderGuestId) {
		throw error(401, 'Unauthorized: please provide guest or host credentials to upload.');
	}

	// Enforce the per-event storage quota. Previously only the per-file limit was
	// checked, so one guest could fill the server disk with many maximum-size files
	// while the admin UI showed quotaPerEventMb as if it were active.
	//
	// Counted: media that reached a terminal state ('ready'/'failed', i.e. bytes on
	// disk) plus the sizes currently reserved by in-flight uploads, so parallel
	// uploads are still bounded. Deliberately NOT counted: abandoned 'uploading'
	// sessions - a guest could otherwise burn the entire quota by opening sessions
	// and never sending a chunk. MediaRepository.cleanupAbandonedUploads() sweeps
	// those on a TTL.
	//
	// Known limitation: this read-then-write is not atomic, so N simultaneous POSTs
	// for the same event each observe the same total. Every session is bounded by
	// maxUploadSizeMb on its own, so the overshoot is at most
	// (concurrentRequests - 1) * maxUploadSizeMb. SQLite writes are serialized and
	// the per-file cap keeps that acceptable for a self-hosted instance.
	const quotaBytes = settings.quotaPerEventMb * 1024 * 1024;
	if (quotaBytes > 0) {
		const committedBytes = MediaRepository.sumOriginalSizeByEvent(eventId);
		const pendingBytes = MediaRepository.sumPendingSizeByEvent(eventId);
		if (committedBytes + pendingBytes + totalSize > quotaBytes) {
			throw error(413, `Event storage quota exceeded (${settings.quotaPerEventMb} MB per event).`);
		}
	}

	const session = TusServer.createUpload({
		eventId,
		uploaderGuestId,
		totalSize,
		filename,
		mimeType
	});

	return new Response(null, {
		status: 201,
		headers: {
			Location: `/api/upload/${session.id}`,
			'Tus-Resumable': TUS_VERSION,
			'Upload-Offset': '0',
			'Access-Control-Expose-Headers': 'Location, Tus-Resumable, Upload-Offset'
		}
	});
};
