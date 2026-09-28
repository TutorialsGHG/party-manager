import crypto from 'node:crypto';
import fs from 'node:fs';
import { MediaRepository } from '$lib/server/db/media.repository.js';
import { appendUploadChunk, getTempTailPath } from './blob-store.js';
import { mediaQueue } from '$lib/server/media/queue.js';

export interface TusUploadSession {
	id: string;
	mediaId: string;
	eventId: string;
	uploaderGuestId: string;
	totalSize: number;
	offset: number;
	filename: string;
	mimeType: string;
	fileKey: Buffer;
	salt: Buffer;
	createdAt: number;
}

// In-memory sessions store (survives active requests, cleaned up on completion or timeout)
const uploadSessions = new Map<string, TusUploadSession>();

/**
 * Parses a standard Tus Upload-Metadata header.
 */
export function parseTusMetadata(header: string | null): Record<string, string> {
	const result: Record<string, string> = {};
	if (!header) return result;
	const pairs = header.split(',');
	for (const pair of pairs) {
		const [k, v] = pair.trim().split(/\s+/);
		if (k && v) {
			try {
				result[k] = Buffer.from(v, 'base64').toString('utf8');
			} catch {
				result[k] = v;
			}
		}
	}
	return result;
}

/**
 * Serializes metadata back to a Tus Upload-Metadata header string.
 */
export function serializeTusMetadata(metadata: Record<string, string>): string {
	return Object.entries(metadata)
		.map(([k, v]) => `${k} ${Buffer.from(v, 'utf8').toString('base64')}`)
		.join(',');
}

export class TusServer {
	/**
	 * Initializes a new Tus upload session and inserts the pending media row in SQLite.
	 */
	static createUpload(params: {
		eventId: string;
		uploaderGuestId: string;
		totalSize: number;
		filename: string;
		mimeType: string;
	}): TusUploadSession {
		const id = crypto.randomUUID();
		const mediaId = id;
		const fileKey = crypto.randomBytes(32);
		const salt = crypto.randomBytes(8);

		// Create DB entry in 'uploading' state
		MediaRepository.createPendingMedia({
			id: mediaId,
			eventId: params.eventId,
			uploaderGuestId: params.uploaderGuestId,
			mimeType: params.mimeType,
			originalSize: params.totalSize,
			originalFilename: params.filename,
			fileKey,
			salt
		});

		const session: TusUploadSession = {
			id,
			mediaId,
			eventId: params.eventId,
			uploaderGuestId: params.uploaderGuestId,
			totalSize: params.totalSize,
			offset: 0,
			filename: params.filename,
			mimeType: params.mimeType,
			fileKey,
			salt,
			createdAt: Date.now()
		};

		uploadSessions.set(id, session);
		return session;
	}

	/**
	 * Retrieves an active upload session.
	 */
	static getUpload(id: string): TusUploadSession | null {
		const existing = uploadSessions.get(id);
		if (existing) return existing;

		// Try restoring from DB if server restarted mid-upload
		const media = MediaRepository.getById(id);
		if (!media || media.status !== 'uploading') return null;

		const keys = MediaRepository.getMediaKeys(id);
		if (!keys) return null;

		// Check tail and chunk state to restore offset
		const tailP = getTempTailPath(id);
		let tailLen = 0;
		if (fs.existsSync(tailP)) {
			tailLen = fs.statSync(tailP).size;
		}

		const restored: TusUploadSession = {
			id: media.id,
			mediaId: media.id,
			eventId: media.eventId,
			uploaderGuestId: media.uploaderGuestId,
			totalSize: media.originalSize,
			offset: tailLen, // approximate offset
			filename: media.originalFilename,
			mimeType: media.mimeType,
			fileKey: keys.fileKey,
			salt: keys.salt,
			createdAt: media.createdAt
		};

		uploadSessions.set(id, restored);
		return restored;
	}

	/**
	 * Appends an incoming chunk to the upload.
	 */
	static appendChunk(id: string, chunk: Buffer, clientOffset: number): number {
		const session = this.getUpload(id);
		if (!session) {
			throw new Error('Upload session not found.');
		}

		if (session.offset !== clientOffset) {
			throw new Error(`Offset mismatch: client said ${clientOffset}, server has ${session.offset}`);
		}

		const newOffset = appendUploadChunk(
			session.id,
			session.mediaId,
			chunk,
			session.fileKey,
			session.salt,
			session.offset,
			session.totalSize
		);

		session.offset = newOffset;

		// If finished, enqueue for processing and remove session from map
		if (newOffset >= session.totalSize) {
			uploadSessions.delete(id);
			mediaQueue.enqueue(session.mediaId);
		}

		return newOffset;
	}

	/**
	 * Cancels and destroys an in-progress upload.
	 */
	static cancelUpload(id: string): void {
		uploadSessions.delete(id);
		MediaRepository.deleteMedia(id);
	}
}
