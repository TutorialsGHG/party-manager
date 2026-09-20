export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface TusClientOptions {
  file: File;
  eventId: string;
  guestToken?: string;
  chunkSize?: number; // default 1 MiB
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Lightweight native client for uploading files to the self-hosted Tus endpoint.
 */
export async function uploadMediaWithTus(options: TusClientOptions): Promise<string> {
  const {
    file,
    eventId,
    guestToken,
    chunkSize = 1024 * 1024, // 1 MiB
    onProgress,
    signal
  } = options;

  // 1. Prepare Tus metadata
  const metadataParts = [
    `filename ${btoa(unescape(encodeURIComponent(file.name)))}`,
    `filetype ${btoa(file.type || 'application/octet-stream')}`,
    `eventId ${btoa(eventId)}`
  ];

  if (guestToken) {
    metadataParts.push(`guestToken ${btoa(guestToken)}`);
  }

  // 2. Initiate upload session (POST)
  const headers: Record<string, string> = {
    'Tus-Resumable': '1.0.0',
    'Upload-Length': String(file.size),
    'Upload-Metadata': metadataParts.join(',')
  };

  if (guestToken) {
    headers['X-Guest-Token'] = guestToken;
  }

  const initRes = await fetch('/api/upload', {
    method: 'POST',
    headers,
    signal
  });

  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`Upload initialization failed (${initRes.status}): ${text}`);
  }

  const uploadLocation = initRes.headers.get('Location');
  if (!uploadLocation) {
    throw new Error('Server did not return a Location header for upload.');
  }

  // 3. Upload chunks incrementally (PATCH)
  let offset = 0;
  const total = file.size;

  while (offset < total) {
    if (signal?.aborted) {
      throw new Error('Upload aborted');
    }

    const end = Math.min(offset + chunkSize, total);
    const chunkBlob = file.slice(offset, end);
    const chunkBuffer = await chunkBlob.arrayBuffer();

    const patchHeaders: Record<string, string> = {
      'Tus-Resumable': '1.0.0',
      'Upload-Offset': String(offset),
      'Content-Type': 'application/offset+octet-stream'
    };

    if (guestToken) {
      patchHeaders['X-Guest-Token'] = guestToken;
    }

    const patchRes = await fetch(uploadLocation, {
      method: 'PATCH',
      headers: patchHeaders,
      body: chunkBuffer,
      signal
    });

    if (!patchRes.ok) {
      throw new Error(`Chunk upload failed with status ${patchRes.status}`);
    }

    const newOffsetHeader = patchRes.headers.get('Upload-Offset');
    if (newOffsetHeader) {
      offset = parseInt(newOffsetHeader, 10);
    } else {
      offset = end;
    }

    if (onProgress) {
      onProgress({
        loaded: offset,
        total,
        percentage: Math.min(100, Math.round((offset / total) * 100))
      });
    }
  }

  // Extract the mediaId from Location (/api/upload/[id])
  const parts = uploadLocation.split('/');
  return parts[parts.length - 1];
}
