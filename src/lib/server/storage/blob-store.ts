import fs from 'node:fs';
import path from 'node:path';
import {
  CHUNK_PLAINTEXT_SIZE,
  CHUNK_OVERHEAD,
  encryptChunk,
  decryptChunk,
  decryptRange
} from '$lib/server/crypto/chunk-stream.js';

const BLOBS_DIR = path.resolve('data/blobs');
const TEMP_DIR = path.resolve('data/blobs/temp');

function ensureDirs() {
  if (!fs.existsSync(BLOBS_DIR)) {
    fs.mkdirSync(BLOBS_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

export type BlobVariant = 'original' | 'web' | 'thumb';

export function getBlobPath(mediaId: string, variant: BlobVariant = 'original'): string {
  ensureDirs();
  const suffix = variant === 'original' ? '' : `.${variant}`;
  return path.join(BLOBS_DIR, `${mediaId}${suffix}.enc`);
}

export function getTempTailPath(uploadId: string): string {
  ensureDirs();
  return path.join(TEMP_DIR, `${uploadId}.tail`);
}

/**
 * Writes a full plaintext buffer as chunked encrypted blob file.
 */
export function writePlaintextAsBlob(
  mediaId: string,
  plaintext: Buffer,
  fileKey: Buffer,
  salt: Buffer,
  variant: BlobVariant = 'original'
): void {
  ensureDirs();
  const filePath = getBlobPath(mediaId, variant);
  const totalSize = plaintext.length;
  const totalChunks = Math.ceil(totalSize / CHUNK_PLAINTEXT_SIZE) || 1;

  const outFd = fs.openSync(filePath, 'w');
  try {
    for (let c = 0; c < totalChunks; c++) {
      const isFinal = c === totalChunks - 1;
      const start = c * CHUNK_PLAINTEXT_SIZE;
      const end = Math.min(start + CHUNK_PLAINTEXT_SIZE, totalSize);
      const plainChunk = plaintext.subarray(start, end);

      const encryptedChunk = encryptChunk(plainChunk, fileKey, salt, mediaId, c, isFinal);
      fs.writeSync(outFd, encryptedChunk);
    }
  } finally {
    fs.closeSync(outFd);
  }
}

/**
 * Reads and decrypts an entire chunked blob file into a plaintext buffer.
 */
export function readBlobAsPlaintext(
  mediaId: string,
  fileKey: Buffer,
  totalPlaintextSize: number,
  variant: BlobVariant = 'original'
): Buffer {
  const filePath = getBlobPath(mediaId, variant);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Blob file not found: ${filePath}`);
  }

  if (totalPlaintextSize === 0) {
    return Buffer.alloc(0);
  }

  return decryptRange(filePath, fileKey, mediaId, totalPlaintextSize, 0, totalPlaintextSize - 1);
}

/**
 * Appends streaming data to an upload, encrypting completed 1-MiB chunks immediately.
 * Returns the new total plain bytes written so far.
 */
export function appendUploadChunk(
  uploadId: string,
  mediaId: string,
  incomingData: Buffer,
  fileKey: Buffer,
  salt: Buffer,
  currentOffset: number,
  totalExpectedSize: number
): number {
  ensureDirs();
  const targetEncPath = getBlobPath(mediaId, 'original');
  const tailPath = getTempTailPath(uploadId);

  // Read existing tail if any
  let leftover = Buffer.alloc(0);
  if (fs.existsSync(tailPath)) {
    leftover = fs.readFileSync(tailPath);
  }

  const combined = Buffer.concat([leftover, incomingData]);
  const newTotalOffset = currentOffset + incomingData.length;
  const totalChunks = Math.ceil(totalExpectedSize / CHUNK_PLAINTEXT_SIZE) || 1;

  // Which chunk index are we starting at?
  // Previous fully written chunks = floor((currentOffset - leftover.length) / CHUNK_PLAINTEXT_SIZE)
  let chunkIndex = Math.floor((currentOffset - leftover.length) / CHUNK_PLAINTEXT_SIZE);

  let cursor = 0;
  const outFd = fs.openSync(targetEncPath, fs.existsSync(targetEncPath) ? 'a' : 'w');

  try {
    while (cursor + CHUNK_PLAINTEXT_SIZE <= combined.length) {
      const plainChunk = combined.subarray(cursor, cursor + CHUNK_PLAINTEXT_SIZE);
      const isFinal = chunkIndex === totalChunks - 1;

      const encChunk = encryptChunk(plainChunk, fileKey, salt, mediaId, chunkIndex, isFinal);
      fs.writeSync(outFd, encChunk);

      cursor += CHUNK_PLAINTEXT_SIZE;
      chunkIndex++;
    }

    const remaining = combined.subarray(cursor);

    // If upload is now fully completed and there's a final partial chunk
    if (newTotalOffset === totalExpectedSize) {
      if (remaining.length > 0) {
        const isFinal = true;
        const encChunk = encryptChunk(remaining, fileKey, salt, mediaId, chunkIndex, isFinal);
        fs.writeSync(outFd, encChunk);
      }
      // Clean up tail file
      if (fs.existsSync(tailPath)) {
        fs.unlinkSync(tailPath);
      }
    } else {
      // Save remaining partial tail
      fs.writeFileSync(tailPath, remaining);
    }

    return newTotalOffset;
  } finally {
    fs.closeSync(outFd);
  }
}

/**
 * Completely removes all encrypted blob files and temporary upload artifacts for a media ID.
 */
export function deleteMediaBlobs(mediaId: string): void {
  ensureDirs();
  const variants: BlobVariant[] = ['original', 'web', 'thumb'];
  for (const v of variants) {
    const p = getBlobPath(mediaId, v);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (e) {
        console.error(`Failed to unlink blob ${p}:`, e);
      }
    }
  }

  // Also clean up any upload tail
  const tailP = getTempTailPath(mediaId);
  if (fs.existsSync(tailP)) {
    try {
      fs.unlinkSync(tailP);
    } catch (e) {
      console.error(`Failed to unlink tail ${tailP}:`, e);
    }
  }
}

/**
 * Checks if a specific blob variant exists on disk.
 */
export function blobExists(mediaId: string, variant: BlobVariant = 'original'): boolean {
  return fs.existsSync(getBlobPath(mediaId, variant));
}

/**
 * Returns the size on disk of an encrypted blob file.
 */
export function getBlobDiskSize(mediaId: string, variant: BlobVariant = 'original'): number {
  const p = getBlobPath(mediaId, variant);
  if (!fs.existsSync(p)) return 0;
  return fs.statSync(p).size;
}
