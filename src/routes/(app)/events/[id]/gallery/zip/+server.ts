import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findEventById } from '$lib/server/db/repositories/event.repository.js';
import { MediaRepository } from '$lib/server/db/repositories/media.repository.js';
import { readBlobAsPlaintext } from '$lib/server/storage/blob-store.js';
import { createZipArchive, type ZipEntry } from '$lib/server/media/zip.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const event = findEventById(params.id, locals.user.id);
	if (!event && locals.user.role !== 'admin') {
		throw error(404, 'Event not found');
	}

	const mediaList = MediaRepository.listByEvent(params.id);
	const readyMedia = mediaList.filter((m) => m.status === 'ready');

	if (readyMedia.length === 0) {
		throw error(404, 'No media available to download');
	}

	const entries: ZipEntry[] = [];
	for (const item of readyMedia) {
		const keys = MediaRepository.getMediaKeys(item.id);
		if (!keys) continue;

		try {
			const plaintext = readBlobAsPlaintext(
				item.id,
				keys.fileKey,
				keys.totalPlaintextSize,
				'original'
			);

			entries.push({
				name: item.originalFilename || `media-${item.id}`,
				data: plaintext,
				date: new Date(item.createdAt)
			});
		} catch (err) {
			console.error(`Failed to read media ${item.id} for zip download:`, err);
		}
	}

	if (entries.length === 0) {
		throw error(500, 'Failed to extract any media files');
	}

	const zipBuffer = createZipArchive(entries);
	const safeEventTitle = (event?.title || 'event')
		.replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_')
		.slice(0, 30);
	const filename = `${safeEventTitle}_gallery.zip`;

	return new Response(new Uint8Array(zipBuffer), {
		status: 200,
		headers: {
			'Content-Type': 'application/zip',
			'Content-Length': String(zipBuffer.length),
			'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
			'Cache-Control': 'private, no-cache'
		}
	});
};
