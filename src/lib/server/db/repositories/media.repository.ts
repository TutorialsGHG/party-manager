import { getDb } from '../client.js';
import { getEventKey, encryptText, decryptText } from '../../crypto/envelope.js';
import { deleteMediaBlobs } from '../../storage/blob-store.js';

export type MediaStatus = 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';

export interface MediaRow {
	id: string;
	event_id: string;
	uploader_guest_id: string;
	mime_type: string;
	original_size: number;
	processed_size: number | null;
	duration_seconds: number | null;
	status: MediaStatus;
	salt: string;
	file_key_cipher: string;
	blurhash: string | null;
	original_filename_cipher: string;
	created_at: number;
}

export interface MediaItem {
	id: string;
	eventId: string;
	uploaderGuestId: string;
	uploaderName?: string;
	mimeType: string;
	originalSize: number;
	processedSize: number | null;
	durationSeconds: number | null;
	status: MediaStatus;
	blurhash: string | null;
	originalFilename: string;
	createdAt: number;
}

export interface MediaKeys {
	fileKey: Buffer;
	salt: Buffer;
}

export class MediaRepository {
	/**
	 * Creates a new pending media record before chunked upload starts.
	 */
	static createPendingMedia(params: {
		id: string;
		eventId: string;
		uploaderGuestId: string;
		mimeType: string;
		originalSize: number;
		originalFilename: string;
		fileKey: Buffer;
		salt: Buffer;
	}): MediaItem {
		const db = getDb();
		const eventKey = getEventKey(params.eventId);

		const fileKeyCipher = encryptText(
			params.fileKey.toString('base64'),
			eventKey,
			`media:${params.id}:file_key`
		);

		const filenameCipher = encryptText(
			params.originalFilename,
			eventKey,
			`media:${params.id}:original_filename`
		);

		const now = Date.now();
		const saltHex = params.salt.toString('hex');

		db.prepare(
			`INSERT INTO media (
        id, event_id, uploader_guest_id, mime_type, original_size,
        status, salt, file_key_cipher, original_filename_cipher, created_at
      ) VALUES (?, ?, ?, ?, ?, 'uploading', ?, ?, ?, ?)`
		).run(
			params.id,
			params.eventId,
			params.uploaderGuestId,
			params.mimeType,
			params.originalSize,
			saltHex,
			fileKeyCipher,
			filenameCipher,
			now
		);

		return {
			id: params.id,
			eventId: params.eventId,
			uploaderGuestId: params.uploaderGuestId,
			mimeType: params.mimeType,
			originalSize: params.originalSize,
			processedSize: null,
			durationSeconds: null,
			status: 'uploading',
			blurhash: null,
			originalFilename: params.originalFilename,
			createdAt: now
		};
	}

	/**
	 * Retrieves raw keys for encrypting / decrypting chunks.
	 */
	static getMediaKeys(
		mediaId: string
	): (MediaKeys & { eventId: string; totalPlaintextSize: number; mimeType: string }) | null {
		const db = getDb();
		const row = db
			.prepare(
				'SELECT event_id, salt, file_key_cipher, original_size, mime_type FROM media WHERE id = ?'
			)
			.get(mediaId) as
			| {
					event_id: string;
					salt: string;
					file_key_cipher: string;
					original_size: number;
					mime_type: string;
			  }
			| undefined;

		if (!row) return null;

		const eventKey = getEventKey(row.event_id);
		const rawKeyB64 = decryptText(row.file_key_cipher, eventKey, `media:${mediaId}:file_key`);

		return {
			fileKey: Buffer.from(rawKeyB64, 'base64'),
			salt: Buffer.from(row.salt, 'hex'),
			eventId: row.event_id,
			totalPlaintextSize: row.original_size,
			mimeType: row.mime_type
		};
	}

	/**
	 * Retrieves a single media item by ID.
	 */
	static getById(id: string): MediaItem | null {
		const db = getDb();
		const row = db
			.prepare(
				`SELECT m.*, g.name_cipher as uploader_name_cipher
         FROM media m
         LEFT JOIN guests g ON m.uploader_guest_id = g.id
         WHERE m.id = ?`
			)
			.get(id) as (MediaRow & { uploader_name_cipher: string | null }) | undefined;

		if (!row) return null;

		const eventKey = getEventKey(row.event_id);
		let originalFilename: string;
		try {
			originalFilename = decryptText(
				row.original_filename_cipher,
				eventKey,
				`media:${row.id}:original_filename`
			);
		} catch {
			originalFilename = 'file';
		}

		let uploaderName: string | undefined;
		if (row.uploader_name_cipher) {
			try {
				uploaderName = decryptText(
					row.uploader_name_cipher,
					eventKey,
					`guests:${row.uploader_guest_id}:name`
				);
			} catch {
				uploaderName = undefined;
			}
		}

		return {
			id: row.id,
			eventId: row.event_id,
			uploaderGuestId: row.uploader_guest_id,
			uploaderName,
			mimeType: row.mime_type,
			originalSize: row.original_size,
			processedSize: row.processed_size,
			durationSeconds: row.duration_seconds,
			status: row.status,
			blurhash: row.blurhash,
			originalFilename,
			createdAt: row.created_at
		};
	}

	/**
	 * Sums the sizes that actually occupy storage for an event.
	 *
	 * Only rows that reached a terminal state count: 'ready' and 'failed' media
	 * exist on disk, while 'uploading' rows are created at POST /api/upload time
	 * (before the first byte arrives) and 'queued'/'processing' rows are in flight.
	 * Summing every row let a single guest reserve the whole quota by opening
	 * upload sessions and never sending a chunk - there is no client-side path that
	 * reliably sends the DELETE, and the process restart in TusServer.getUpload
	 * means a resumed-but-abandoned session keeps its row forever.
	 */
	static sumOriginalSizeByEvent(eventId: string): number {
		const row = getDb()
			.prepare(
				`SELECT COALESCE(SUM(original_size), 0) AS total
         FROM media
         WHERE event_id = ? AND status IN ('ready', 'failed')`
			)
			.get(eventId) as { total: number };
		return row?.total || 0;
	}

	/**
	 * Number of bytes currently reserved by in-flight uploads of an event.
	 *
	 * Counted on top of sumOriginalSizeByEvent so that concurrent uploads within
	 * the quota are still bounded, without letting abandoned sessions block the
	 * event permanently.
	 */
	static sumPendingSizeByEvent(eventId: string): number {
		const row = getDb()
			.prepare(
				`SELECT COALESCE(SUM(original_size), 0) AS total
         FROM media
         WHERE event_id = ? AND status IN ('uploading', 'queued', 'processing')`
			)
			.get(eventId) as { total: number };
		return row?.total || 0;
	}

	/**
	 * Removes upload sessions that were never completed.
	 *
	 * An abandoned session keeps its media row (status 'uploading') plus its
	 * temporary tail file on disk forever, because the DELETE path only runs when
	 * a client cooperates. This sweeps rows older than the given age.
	 *
	 * @returns the number of removed media rows
	 */
	static cleanupAbandonedUploads(olderThanMs: number): number {
		const db = getDb();
		const cutoff = Date.now() - olderThanMs;

		const stale = db
			.prepare(
				`SELECT id FROM media
         WHERE status = 'uploading' AND created_at < ?`
			)
			.all(cutoff) as { id: string }[];

		for (const row of stale) {
			// deleteMedia also unlinks the partial blob and the temp tail.
			MediaRepository.deleteMedia(row.id);
		}

		return stale.length;
	}

	/**
	 * Lists all media items for an event.
	 */
	static listByEvent(eventId: string): MediaItem[] {
		const db = getDb();
		const rows = db
			.prepare(
				`SELECT m.*, g.name_cipher as uploader_name_cipher
         FROM media m
         LEFT JOIN guests g ON m.uploader_guest_id = g.id
         WHERE m.event_id = ?
         ORDER BY m.created_at DESC`
			)
			.all(eventId) as (MediaRow & { uploader_name_cipher: string | null })[];

		if (rows.length === 0) return [];

		const eventKey = getEventKey(eventId);

		return rows.map((row) => {
			let originalFilename: string;
			try {
				originalFilename = decryptText(
					row.original_filename_cipher,
					eventKey,
					`media:${row.id}:original_filename`
				);
			} catch {
				originalFilename = 'file';
			}

			let uploaderName: string | undefined;
			if (row.uploader_name_cipher) {
				try {
					uploaderName = decryptText(
						row.uploader_name_cipher,
						eventKey,
						`guests:${row.uploader_guest_id}:name`
					);
				} catch {
					uploaderName = undefined;
				}
			}

			return {
				id: row.id,
				eventId: row.event_id,
				uploaderGuestId: row.uploader_guest_id,
				uploaderName,
				mimeType: row.mime_type,
				originalSize: row.original_size,
				processedSize: row.processed_size,
				durationSeconds: row.duration_seconds,
				status: row.status,
				blurhash: row.blurhash,
				originalFilename,
				createdAt: row.created_at
			};
		});
	}

	/**
	 * Updates media status and metadata after processing finishes.
	 */
	static updateProcessed(
		id: string,
		data: {
			status: MediaStatus;
			processedSize?: number | null;
			durationSeconds?: number | null;
			blurhash?: string | null;
			mimeType?: string;
		}
	): void {
		const db = getDb();
		db.prepare(
			`UPDATE media
       SET status = ?,
           processed_size = COALESCE(?, processed_size),
           duration_seconds = COALESCE(?, duration_seconds),
           blurhash = COALESCE(?, blurhash),
           mime_type = COALESCE(?, mime_type)
       WHERE id = ?`
		).run(
			data.status,
			data.processedSize ?? null,
			data.durationSeconds ?? null,
			data.blurhash ?? null,
			data.mimeType ?? null,
			id
		);
	}

	/**
	 * Updates media status (e.g. uploading -> queued -> processing -> ready / failed).
	 */
	static updateStatus(id: string, status: MediaStatus): void {
		const db = getDb();
		db.prepare('UPDATE media SET status = ? WHERE id = ?').run(status, id);
	}

	/**
	 * Deletes a media entry from the database and scrubs all encrypted blob files.
	 * Returns the event ID if deleted, or null if not found.
	 */
	static deleteMedia(id: string): string | null {
		const db = getDb();
		const row = db.prepare('SELECT event_id FROM media WHERE id = ?').get(id) as
			{ event_id: string } | undefined;
		if (!row) return null;

		db.prepare('DELETE FROM media WHERE id = ?').run(id);

		// Delete encrypted blobs on disk
		deleteMediaBlobs(id);

		return row.event_id;
	}
}
