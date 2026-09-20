import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TusServer, parseTusMetadata } from '$lib/server/storage/tus.js';
import { findEventById } from '$lib/server/db/repositories/event.repository.js';
import {
  findGuestByDeviceToken,
  registerGuest
} from '$lib/server/db/repositories/guest.repository.js';

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

  if (totalSize > MAX_UPLOAD_SIZE) {
    throw error(413, 'File size exceeds maximum upload limit.');
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
      metadata.guestToken ||
      request.headers.get('x-guest-token') ||
      cookies.get(cookieName);

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
