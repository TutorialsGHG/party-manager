import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TusServer } from '$lib/server/storage/tus.js';

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

export const HEAD: RequestHandler = async ({ params }) => {
	const session = TusServer.getUpload(params.id);
	if (!session) {
		throw error(404, 'Upload session not found.');
	}

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

export const PATCH: RequestHandler = async ({ request, params }) => {
	const session = TusServer.getUpload(params.id);
	if (!session) {
		throw error(404, 'Upload session not found.');
	}

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

export const DELETE: RequestHandler = async ({ params }) => {
	TusServer.cancelUpload(params.id);
	return new Response(null, {
		status: 204,
		headers: {
			'Tus-Resumable': TUS_VERSION
		}
	});
};
