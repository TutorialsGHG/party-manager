import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { runMigrations } from '../../../src/lib/server/db/migrate.js';
import { createUser } from '../../../src/lib/server/db/repositories/user.repository.js';
import { hashPassword } from '../../../src/lib/server/auth/password.js';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery.js';
import { createEvent } from '../../../src/lib/server/db/repositories/event.repository.js';
import { registerGuest } from '../../../src/lib/server/db/repositories/guest.repository.js';
import { MediaRepository } from '../../../src/lib/server/db/repositories/media.repository.js';
import { TusServer } from '../../../src/lib/server/storage/tus.js';
import {
  readBlobAsPlaintext,
  writePlaintextAsBlob,
  getBlobPath,
  blobExists,
  deleteMediaBlobs
} from '../../../src/lib/server/storage/blob-store.js';
import { decryptRange } from '../../../src/lib/server/crypto/chunk-stream.js';

describe('Encrypted Media Storage & Tus Resumable Pipeline', () => {
  let hostId = '';
  let eventId = '';
  let guestId = '';

  beforeAll(async () => {
    runMigrations();
    const pwdHash = await hashPassword('MediaHostPass123!');
    const codes = generateRecoveryCodes(10).map((c) => c.codeHash);
    const { user } = createUser(`mediahost-${Date.now()}@party.local`, pwdHash, codes);
    hostId = user.id;

    const event = createEvent(hostId, {
      title: 'Fotoparty 2026',
      dateStart: '2026-08-15T18:00:00.000Z',
      accentColor: '#FF9500'
    });
    eventId = event.id;

    const guest = registerGuest(eventId, 'device-token-media-test', 'Fotograf Max');
    guestId = guest.id;
  });

  it('initializes a Tus upload and saves encrypted media metadata', () => {
    const totalSize = 2.5 * 1024 * 1024; // 2.5 MiB
    const session = TusServer.createUpload({
      eventId,
      uploaderGuestId: guestId,
      totalSize,
      filename: 'feuerwerk.jpg',
      mimeType: 'image/jpeg'
    });

    expect(session.id).toBeDefined();
    expect(session.offset).toBe(0);
    expect(session.totalSize).toBe(totalSize);

    const media = MediaRepository.getById(session.mediaId);
    expect(media).not.toBeNull();
    expect(media?.originalFilename).toBe('feuerwerk.jpg');
    expect(media?.status).toBe('uploading');
    expect(media?.uploaderName).toBe('Fotograf Max');
  });

  it('streams chunks across 1-MiB boundaries with instant AES-256-GCM encryption', () => {
    // 2.5 MiB total = 2 full 1-MiB chunks + 1 half 0.5-MiB chunk
    const totalSize = 2.5 * 1024 * 1024;
    const testData = crypto.randomBytes(totalSize);
    // Write valid PNG header
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(testData, 0);

    const session = TusServer.createUpload({
      eventId,
      uploaderGuestId: guestId,
      totalSize,
      filename: 'großes-bild.png',
      mimeType: 'image/png'
    });

    // Send in 768 KiB chunks (asymmetrical to test arbitrary client chunk boundaries)
    const clientChunkSize = 768 * 1024;
    let currentOffset = 0;

    while (currentOffset < totalSize) {
      const slice = testData.subarray(currentOffset, Math.min(currentOffset + clientChunkSize, totalSize));
      currentOffset = TusServer.appendChunk(session.id, slice, currentOffset);
    }

    expect(currentOffset).toBe(totalSize);

    // Verify encrypted file exists on disk and is chunk-encrypted
    const encPath = getBlobPath(session.mediaId, 'original');
    expect(fs.existsSync(encPath)).toBe(true);

    const keys = MediaRepository.getMediaKeys(session.mediaId);
    expect(keys).not.toBeNull();

    // Decrypt the entire file and verify byte-for-byte fidelity
    const decrypted = readBlobAsPlaintext(session.mediaId, keys!.fileKey, totalSize, 'original');
    expect(decrypted.equals(testData)).toBe(true);
  });

  it('supports deterministic HTTP Range request decryption across chunk boundaries', () => {
    const totalSize = 2.5 * 1024 * 1024;
    const testData = crypto.randomBytes(totalSize);

    const mediaId = crypto.randomUUID();
    const fileKey = crypto.randomBytes(32);
    const salt = crypto.randomBytes(8);

    // Write directly via blob-store
    writePlaintextAsBlob(mediaId, testData, fileKey, salt, 'original');

    const encPath = getBlobPath(mediaId, 'original');

    // Test a Range slice that crosses chunk 0 into chunk 1:
    // from 900 KiB to 1.3 MiB
    const rangeStart = 900 * 1024;
    const rangeEnd = 1300 * 1024;

    const slice = decryptRange(encPath, fileKey, mediaId, totalSize, rangeStart, rangeEnd);
    const expectedSlice = testData.subarray(rangeStart, rangeEnd + 1);

    expect(slice.length).toBe(expectedSlice.length);
    expect(slice.equals(expectedSlice)).toBe(true);

    // Clean up
    deleteMediaBlobs(mediaId);
  });

  it('updates processed status and deletes with crypto-shredding', () => {
    const session = TusServer.createUpload({
      eventId,
      uploaderGuestId: guestId,
      totalSize: 1024,
      filename: 'test.jpg',
      mimeType: 'image/jpeg'
    });

    MediaRepository.updateProcessed(session.mediaId, {
      status: 'ready',
      processedSize: 800,
      blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
      mimeType: 'image/webp'
    });

    const item = MediaRepository.getById(session.mediaId);
    expect(item?.status).toBe('ready');
    expect(item?.blurhash).toBe('L6PZfSi_.AyE_3t7t7R**0o#DgR4');
    expect(item?.mimeType).toBe('image/webp');

    // Deletion
    const deletedEventId = MediaRepository.deleteMedia(session.mediaId);
    expect(deletedEventId).toBe(eventId);

    // Verify row removed from DB
    expect(MediaRepository.getById(session.mediaId)).toBeNull();
    // Verify blobs deleted
    expect(blobExists(session.mediaId, 'original')).toBe(false);
  });
});
