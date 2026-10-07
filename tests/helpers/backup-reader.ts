/**
 * Phase 2 of the backup/restore round-trip: the READER (restore).
 *
 * Also a standalone child process, so the master key must be unwrapped from
 * /config/keys/master_priv.pem.enc from scratch. If /config is missing or the
 * passphrase is wrong, this must fail loudly rather than return empty data - that
 * is the whole reason BACKUP.md insists both volumes must be kept.
 *
 * Reads the tree written by backup-writer.ts and prints what it could decrypt.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.ROUNDTRIP_DIR!;
const eventId = process.env.ROUNDTRIP_EVENT_ID!;
const userId = process.env.ROUNDTRIP_USER_ID!;
const mediaId = process.env.ROUNDTRIP_MEDIA_ID!;

process.env.DATA_DIR = path.join(root, 'data');
process.env.DATABASE_PATH = path.join(root, 'data', 'app.db');
process.env.BLOB_STORAGE_PATH = path.join(root, 'data', 'blobs');
process.env.CONFIG_DIR = path.join(root, 'config');
process.env.MASTER_KEY_DIR = path.join(root, 'config', 'keys');
process.env.EVENTS_KEY_DIR = path.join(root, 'config', 'keys', 'events');

async function main() {
	const { initMasterKeys } = await import('../../src/lib/server/crypto/master-key');
	const eventRepo = await import('../../src/lib/server/db/repositories/event.repository');
	const { MediaRepository } = await import('../../src/lib/server/db/repositories/media.repository');
	const blobStore = await import('../../src/lib/server/storage/blob-store');
	const crypto = await import('node:crypto');

	// Cold start: no module cache, nothing pre-warmed. This is the restore.
	initMasterKeys();

	const event = eventRepo.findEventById(eventId, userId);
	if (!event) throw new Error('Event not found after restore - keys or database mismatch');

	const keys = MediaRepository.getMediaKeys(mediaId);
	if (!keys) throw new Error('Media keys not found after restore');

	const plaintext = blobStore.readBlobAsPlaintext(mediaId, keys.fileKey, keys.totalPlaintextSize);

	const originalFilename = MediaRepository.getById(mediaId)?.originalFilename ?? '';

	process.stdout.write(
		JSON.stringify({
			ok: true,
			title: event.title,
			description: event.description,
			locationName: event.locationName,
			originalFilename,
			plaintextSize: plaintext.length,
			blobSha: crypto.createHash('sha256').update(plaintext).digest('hex'),
			// Proves the blob really was encrypted on disk, not stored as plaintext.
			blobOnDisk: fs.readFileSync(blobStore.getBlobPath(mediaId)).length
		})
	);
}

void main();
