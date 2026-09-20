import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MediaRepository } from '$lib/server/db/repositories/media.repository.js';
import { findEventById } from '$lib/server/db/repositories/event.repository.js';
import { findGuestByDeviceToken } from '$lib/server/db/repositories/guest.repository.js';
import {
  getBlobPath,
  blobExists,
  readBlobAsPlaintext
} from '$lib/server/storage/blob-store.js';
import { decryptRange } from '$lib/server/crypto/chunk-stream.js';
import fs from 'node:fs';

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

  // Prefer web variant if available and ready, otherwise original
  let variant: 'web' | 'original' = 'original';
  let totalSize = keys.totalPlaintextSize;

  if (blobExists(mediaId, 'web') && media.processedSize) {
    variant = 'web';
    totalSize = media.processedSize;
  }

  const encryptedPath = getBlobPath(mediaId, variant);
  if (!fs.existsSync(encryptedPath)) {
    throw error(404, 'Blob not found on disk');
  }

  const rangeHeader = request.headers.get('range');
  const mimeType = media.mimeType || 'application/octet-stream';

  if (!rangeHeader) {
    // Return full stream / buffer
    const fullBuffer = readBlobAsPlaintext(mediaId, keys.fileKey, totalSize, variant);
    return new Response(new Uint8Array(fullBuffer), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(totalSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-cache'
      }
    });
  }

  // Parse Range header: bytes=start-end
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    throw error(416, 'Invalid Range header');
  }

  const start = parseInt(match[1], 10);
  let end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

  if (start >= totalSize || end >= totalSize || start > end) {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${totalSize}`
      }
    });
  }

  // Cap chunk range to max 2 MiB per slice for fast streaming & memory protection
  const MAX_SLICE = 2 * 1024 * 1024;
  if (end - start + 1 > MAX_SLICE) {
    end = start + MAX_SLICE - 1;
  }

  const decryptedSlice = decryptRange(
    encryptedPath,
    keys.fileKey,
    mediaId,
    totalSize,
    start,
    end
  );

  return new Response(new Uint8Array(decryptedSlice), {
    status: 206,
    headers: {
      'Content-Type': mimeType,
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(decryptedSlice.length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-cache'
    }
  });
};
