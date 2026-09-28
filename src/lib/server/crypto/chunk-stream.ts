import crypto from 'node:crypto';
import fs from 'node:fs';

export const CHUNK_PLAINTEXT_SIZE = 1024 * 1024; // 1 MiB
export const NONCE_LENGTH = 12;
export const TAG_LENGTH = 16;
export const CHUNK_OVERHEAD = NONCE_LENGTH + TAG_LENGTH; // 28 bytes per chunk

export interface FileChunkMetadata {
	fileId: string;
	fileKey: Buffer;
	salt: Buffer; // 8 bytes
	totalSize: number;
}

/**
 * Derives a deterministic 12-byte nonce from an 8-byte file salt and a 32-bit chunk index.
 */
export function deriveChunkNonce(salt: Buffer, chunkIndex: number): Buffer {
	const nonce = Buffer.alloc(NONCE_LENGTH);
	salt.copy(nonce, 0, 0, 8);
	nonce.writeUInt32BE(chunkIndex, 8);
	return nonce;
}

/**
 * Builds standard authenticated associated data (AAD) for a chunk.
 */
export function buildChunkAAD(fileId: string, chunkIndex: number, isFinal: boolean): string {
	return `media:${fileId}:chunk:${chunkIndex}:final:${isFinal ? 1 : 0}`;
}

/**
 * Encrypts a single plaintext buffer chunk.
 * Returns: [Nonce 12B][Ciphertext][Tag 16B]
 */
export function encryptChunk(
	plaintext: Buffer,
	fileKey: Buffer,
	salt: Buffer,
	fileId: string,
	chunkIndex: number,
	isFinal: boolean
): Buffer {
	const nonce = deriveChunkNonce(salt, chunkIndex);
	const aad = buildChunkAAD(fileId, chunkIndex, isFinal);

	const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, nonce);
	cipher.setAAD(Buffer.from(aad, 'utf8'));

	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();

	return Buffer.concat([nonce, ciphertext, tag]);
}

/**
 * Decrypts a single chunk formatted as [Nonce 12B][Ciphertext][Tag 16B].
 */
export function decryptChunk(
	chunkBuffer: Buffer,
	fileKey: Buffer,
	fileId: string,
	chunkIndex: number,
	isFinal: boolean
): Buffer {
	if (chunkBuffer.length < CHUNK_OVERHEAD) {
		throw new Error(
			`Corrupted chunk: length ${chunkBuffer.length} is smaller than overhead ${CHUNK_OVERHEAD}`
		);
	}

	const nonce = chunkBuffer.subarray(0, NONCE_LENGTH);
	const ciphertext = chunkBuffer.subarray(NONCE_LENGTH, chunkBuffer.length - TAG_LENGTH);
	const tag = chunkBuffer.subarray(chunkBuffer.length - TAG_LENGTH);

	const aad = buildChunkAAD(fileId, chunkIndex, isFinal);

	const decipher = crypto.createDecipheriv('aes-256-gcm', fileKey, nonce);
	decipher.setAuthTag(tag);
	decipher.setAAD(Buffer.from(aad, 'utf8'));

	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Decrypts a specific byte range of a chunked encrypted file.
 * Returns the requested plaintext slice for HTTP Range requests.
 */
export function decryptRange(
	encryptedFilePath: string,
	fileKey: Buffer,
	fileId: string,
	totalPlaintextSize: number,
	rangeStart: number,
	rangeEnd: number
): Buffer {
	const totalChunks = Math.ceil(totalPlaintextSize / CHUNK_PLAINTEXT_SIZE) || 1;
	const startChunkIdx = Math.floor(rangeStart / CHUNK_PLAINTEXT_SIZE);
	const endChunkIdx = Math.min(Math.floor(rangeEnd / CHUNK_PLAINTEXT_SIZE), totalChunks - 1);

	const fd = fs.openSync(encryptedFilePath, 'r');
	const decryptedPieces: Buffer[] = [];

	try {
		for (let c = startChunkIdx; c <= endChunkIdx; c++) {
			const isFinal = c === totalChunks - 1;
			const expectedPlainLen = isFinal
				? totalPlaintextSize - c * CHUNK_PLAINTEXT_SIZE
				: CHUNK_PLAINTEXT_SIZE;
			const cipherChunkLen = expectedPlainLen + CHUNK_OVERHEAD;

			// Calculate file offset of this chunk in encrypted file
			// Previous chunks were full size: c * (CHUNK_PLAINTEXT_SIZE + CHUNK_OVERHEAD)
			const offsetInEncryptedFile = c * (CHUNK_PLAINTEXT_SIZE + CHUNK_OVERHEAD);

			const chunkBuffer = Buffer.alloc(cipherChunkLen);
			const bytesRead = fs.readSync(fd, chunkBuffer, 0, cipherChunkLen, offsetInEncryptedFile);

			if (bytesRead < cipherChunkLen) {
				throw new Error(`Incomplete encrypted chunk ${c} read from disk`);
			}

			const decryptedChunk = decryptChunk(chunkBuffer, fileKey, fileId, c, isFinal);

			// Determine the slice of this decrypted chunk that belongs to the requested range
			const chunkStartByte = c * CHUNK_PLAINTEXT_SIZE;

			const sliceStart = Math.max(0, rangeStart - chunkStartByte);
			const sliceEnd = Math.min(decryptedChunk.length, rangeEnd - chunkStartByte + 1);

			decryptedPieces.push(decryptedChunk.subarray(sliceStart, sliceEnd));
		}

		return Buffer.concat(decryptedPieces);
	} finally {
		fs.closeSync(fd);
	}
}
