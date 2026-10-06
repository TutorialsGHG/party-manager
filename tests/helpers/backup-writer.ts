/**
 * Phase 1 of the backup/restore round-trip: the WRITER.
 *
 * Runs as a standalone child process so it gets a completely fresh module registry.
 * That is the entire point: `master-key.ts` caches the unwrapped private key in a
 * module-level variable, so an in-process "restore" would read that cache and prove
 * nothing about the keys on disk. A restore that cannot survive a restart is exactly
 * the failure mode this test exists to catch.
 *
 * Writes an event, an RSVP with encrypted notes, and a real encrypted media blob into
 * a private directory tree. The parent process then imports everything cold against a
 * COPY of that tree.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.ROUNDTRIP_DIR!;

process.env.DATA_DIR = path.join(root, 'data');
process.env.DATABASE_PATH = path.join(root, 'data', 'app.db');
process.env.BLOB_STORAGE_PATH = path.join(root, 'data', 'blobs');
process.env.CONFIG_DIR = path.join(root, 'config');
process.env.MASTER_KEY_DIR = path.join(root, 'config', 'keys');
process.env.EVENTS_KEY_DIR = path.join(root, 'config', 'keys', 'events');

async function main() {
	const { runMigrations } = await import('../../src/lib/server/db/migrate');
	const { initMasterKeys } = await import('../../src/lib/server/crypto/master-key');
	const eventRepo = await import('../../src/lib/server/db/repositories/event.repository');
	const guestRepo = await import('../../src/lib/server/db/repositories/guest.repository');
	const rsvpRepo = await import('../../src/lib/server/db/repositories/rsvp.repository');
	const userRepo = await import('../../src/lib/server/db/repositories/user.repository');
	const { MediaRepository } = await import('../../src/lib/server/db/repositories/media.repository');
	const blobStore = await import('../../src/lib/server/storage/blob-store');

	fs.mkdirSync(path.join(root, 'data', 'blobs'), { recursive: true });
	runMigrations();
	initMasterKeys();

	const { user } = userRepo.createUser(
		'roundtrip-host@party.local',
		'fixture-hash-not-a-real-password',
		[]
	);

	const event = eventRepo.createEvent(user.id, {
		title: 'Backup Runtrip Sommerfest',
		description: 'Wiederherstellung muss diesen Klartext liefern',
		dateStart: '2026-08-08T18:00:00.000Z',
		locationName: 'Schulhof',
		locationAddress: 'Hauptweg 1',
		accentColor: '#34C759'
	});

	const guest = guestRepo.registerGuest(event.id, 'roundtrip-device', 'Wiederhersteller');

	rsvpRepo.upsertRsvp(event.id, guest.id, {
		status: 'yes',
		companionCount: 1,
		companionNames: 'Anna Beispiel',
		notes: 'Glutenfrei und lactoseintolerant'
	});

	// A real chunked-encrypted media blob. Database rows alone would not prove the
	// /data side of the backup is complete - this is what makes /config mandatory.
	const plaintext = Buffer.from('Nutzlast des Wiederherstellungstests '.repeat(40), 'utf8');
	const salt = crypto.randomBytes(16);
	const fileKey = crypto.randomBytes(32);
	const mediaId = crypto.randomUUID();

	MediaRepository.createPendingMedia({
		id: mediaId,
		eventId: event.id,
		uploaderGuestId: guest.id,
		mimeType: 'image/jpeg',
		originalSize: plaintext.length,
		fileKey,
		salt,
		originalFilename: 'rundtrip.jpg'
	});
	blobStore.writePlaintextAsBlob(mediaId, plaintext, fileKey, salt);

	process.stdout.write(
		JSON.stringify({
			ok: true,
			userId: user.id,
			eventId: event.id,
			guestId: guest.id,
			mediaId,
			plaintextSize: plaintext.length,
			blobSha: crypto.createHash('sha256').update(plaintext).digest('hex')
		})
	);
}

void main();
