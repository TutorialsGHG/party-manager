import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TusServer } from '$lib/server/storage/tus.js';
import { findEventById } from '$lib/server/db/repositories/event.repository.js';
import { findGuestByDeviceToken } from '$lib/server/db/repositories/guest.repository.js';
import type { TusUploadSession } from '$lib/server/storage/tus.js';

const TUS_VERSION = '1.0.0';

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 204,
		headers: {
			'Tus-Resumable': TUS_VERSION,
			'Tus-Version': TUS_VERSION,
			'Access-Control-Allow-Methods': 'HEAD, PATCH, DELETE, OPTIONS',
			'Access-Control-Allow-Headers':
				'Upload-Offset, Content-Type, Tus-Resumable, Authorization, X-Guest-Token'
		}
	});
};

/**
 * Authorizes a request against an in-progress upload session.
 *
 * Mirrors the authorization of POST /api/upload: the acting party must either own
 * the event (authenticated host) or be the guest who started the upload. Without
 * this, anyone knowing the session UUID could hijack or abort someone else's upload.
 * The session UUID is 122 bit random, but it is exposed via the Location header,
 * browser history, proxy logs and Referer headers.
 */
function authorizeSession(
	session: TusUploadSession,
	locals: App.Locals,
	cookies: import('@sveltejs/kit').Cookies,
	headers: Headers
): void {
	// 1. Authenticated host that owns the event
	if (locals.user) {
		const hostEvent = findEventById(session.eventId, locals.user.id);
		if (hostEvent) return;
	}

	// 2. The guest who created the session (device token via cookie or header,
	//    same dual path as POST /api/upload for clients without a cookie jar)
	const cookieName = `dev_tok_${session.eventId.slice(0, 8)}`;
	const guestToken = headers.get('x-guest-token') || cookies.get(cookieName);
	if (guestToken) {
		const guest = findGuestByDeviceToken(session.eventId, guestToken);
		if (guest && guest.id === session.uploaderGuestId) return;
	}

	throw error(401, 'Unauthorized: you are not the owner of this upload.');
}

export const HEAD: RequestHandler = async ({ params, locals, cookies, request }) => {
	const session = TusServer.getUpload(params.id);
	if (!session) {
		throw error(404, 'Upload session not found.');
	}

	authorizeSession(session, locals, cookies, request.headers);

	return new Response(null, {
		status: 200,
		headers: {
			'Upload-Offset': String(session.offset),
			'Upload-Length': String(session.totalSize),
			'Tus-Resumable': TUS_VERSION,
			'Cache-Control': 'no-store',
			'Access-Control-Expose-Headers': 'Upload-Offset, Upload-Length, Tus-Resumable'
		}
	});
};

export const PATCH: RequestHandler = async ({ request, params, locals, cookies }) => {
	const session = TusServer.getUpload(params.id);
	if (!session) {
		throw error(404, 'Upload session not found.');
	}

	authorizeSession(session, locals, cookies, request.headers);

	const offsetHeader = request.headers.get('upload-offset');
	if (offsetHeader === null) {
		throw error(400, 'Missing Upload-Offset header.');
	}

	const clientOffset = parseInt(offsetHeader, 10);
	if (isNaN(clientOffset) || clientOffset !== session.offset) {
		throw error(409, `Upload offset mismatch. Current offset: ${session.offset}`);
	}

	const contentType = request.headers.get('content-type') || '';
	if (!contentType.startsWith('application/offset+octet-stream')) {
		throw error(
			415,
			'Invalid Content-Type for Tus PATCH. Expected application/offset+octet-stream'
		);
	}

	const rawArrayBuffer = await request.arrayBuffer();
	const chunk = Buffer.from(rawArrayBuffer);

	// The declared Upload-Length is what the quota is billed from
	// (MediaRepository sums media.original_size, which is the declaration), so an
	// oversized chunk would let a guest store far more than the quota counts.
	// appendUploadChunk() writes the incoming buffer unconditionally, so the bound
	// has to be enforced here, before the write.
	const remaining = session.totalSize - session.offset;
	if (chunk.length > remaining) {
		throw error(
			413,
			`Chunk exceeds the declared upload length. Declared: ${session.totalSize} B, ` +
				`already received: ${session.offset} B, chunk: ${chunk.length} B.`
		);
	}

	try {
		const newOffset = TusServer.appendChunk(params.id, chunk, clientOffset);

		return new Response(null, {
			status: 204,
			headers: {
				'Upload-Offset': String(newOffset),
				'Tus-Resumable': TUS_VERSION,
				'Access-Control-Expose-Headers': 'Upload-Offset, Tus-Resumable'
			}
		});
	} catch (err: any) {
		console.error(`Error in PATCH for upload ${params.id}:`, err);
		throw error(500, err.message || 'Chunk append failed.');
	}
};

export const DELETE: RequestHandler = async ({ params, locals, cookies, request }) => {
	const session = TusServer.getUpload(params.id);
	// Do not leak whether a session exists to unauthorized callers.
	if (!session) {
		throw error(404, 'Upload session not found.');
	}

	authorizeSession(session, locals, cookies, request.headers);

	TusServer.cancelUpload(params.id);
	return new Response(null, {
		status: 204,
		headers: {
			'Tus-Resumable': TUS_VERSION
		}
	});
};
