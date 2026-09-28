import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
	initMasterKeys,
	generateEventKey,
	getEventKey,
	encryptText,
	decryptText,
	encryptChunk,
	decryptChunk,
	decryptRange,
	shredEventKey,
	CHUNK_PLAINTEXT_SIZE
} from '../../../src/lib/server/crypto';

describe('Cryptographic Engine & Envelope Encryption', () => {
	beforeAll(() => {
		// Initialize master keys in test environment
		initMasterKeys();
	});

	it('should generate, wrap, unwrap and cache an Event Key', () => {
		const eventId = 'test-event-1';
		const key1 = generateEventKey(eventId);
		expect(key1).toHaveLength(32);

		// Retrieve via LRU cache
		const key2 = getEventKey(eventId);
		expect(key1.equals(key2)).toBe(true);
	});

	it('should encrypt and decrypt text with AAD verification', () => {
		const eventId = 'test-event-text';
		const key = generateEventKey(eventId);
		const plaintext = 'Secret Party Location: Room 404';
		const aad = 'events:test-event-text:location';

		const encrypted = encryptText(plaintext, key, aad);
		expect(encrypted).not.toContain(plaintext);

		const decrypted = decryptText(encrypted, key, aad);
		expect(decrypted).toBe(plaintext);

		// Tamper test 1: Wrong AAD must fail
		expect(() => decryptText(encrypted, key, 'events:other-event:location')).toThrow();

		// Tamper test 2: Modified ciphertext must fail
		const parts = encrypted.split(':');
		const corruptedCipher = parts[2].substring(0, parts[2].length - 2) + 'AA';
		const corruptedPayload = `${parts[0]}:${parts[1]}:${corruptedCipher}`;
		expect(() => decryptText(corruptedPayload, key, aad)).toThrow();
	});

	it('should detect tampered chunks and swapped chunk indexes', () => {
		const fileId = 'test-file-chunks';
		const fileKey = crypto.randomBytes(32);
		const salt = crypto.randomBytes(8);
		const data0 = Buffer.from('Chunk number zero content');
		const data1 = Buffer.from('Chunk number one content');

		const chunk0 = encryptChunk(data0, fileKey, salt, fileId, 0, false);
		const chunk1 = encryptChunk(data1, fileKey, salt, fileId, 1, true);

		// Normal decryption
		expect(decryptChunk(chunk0, fileKey, fileId, 0, false).toString()).toBe(
			'Chunk number zero content'
		);
		expect(decryptChunk(chunk1, fileKey, fileId, 1, true).toString()).toBe(
			'Chunk number one content'
		);

		// Tamper test: Swapping chunks (attempting to read chunk 0 with chunkIndex 1) must fail
		expect(() => decryptChunk(chunk0, fileKey, fileId, 1, false)).toThrow();

		// Tamper test: Falsified final flag must fail
		expect(() => decryptChunk(chunk1, fileKey, fileId, 1, false)).toThrow();

		// Tamper test: Corrupted tag must fail
		const tampered = Buffer.from(chunk0);
		tampered[tampered.length - 1] ^= 0xff; // flip last byte
		expect(() => decryptChunk(tampered, fileKey, fileId, 0, false)).toThrow();
	});

	it('should accurately decrypt byte ranges across chunk boundaries (HTTP Range Requests)', () => {
		const fileId = 'range-test-file';
		const fileKey = crypto.randomBytes(32);
		const salt = crypto.randomBytes(8);

		// Create a simulated 2.5 MiB file (spanning across 3 chunks)
		const totalSize = 2.5 * 1024 * 1024;
		const testPlaintext = crypto.randomBytes(totalSize);

		const tmpFilePath = path.join('data', `${fileId}.enc`);
		if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });

		const totalChunks = Math.ceil(totalSize / CHUNK_PLAINTEXT_SIZE);
		const encryptedChunks: Buffer[] = [];

		for (let c = 0; c < totalChunks; c++) {
			const isFinal = c === totalChunks - 1;
			const start = c * CHUNK_PLAINTEXT_SIZE;
			const end = isFinal ? totalSize : start + CHUNK_PLAINTEXT_SIZE;
			const slice = testPlaintext.subarray(start, end);

			const encChunk = encryptChunk(slice, fileKey, salt, fileId, c, isFinal);
			encryptedChunks.push(encChunk);
		}

		fs.writeFileSync(tmpFilePath, Buffer.concat(encryptedChunks));

		try {
			// Test 1: Range strictly inside chunk 0
			const range1 = decryptRange(tmpFilePath, fileKey, fileId, totalSize, 100, 500);
			expect(range1.equals(testPlaintext.subarray(100, 501))).toBe(true);

			// Test 2: Range spanning across chunk 0 and chunk 1
			const spanStart = CHUNK_PLAINTEXT_SIZE - 500;
			const spanEnd = CHUNK_PLAINTEXT_SIZE + 500;
			const range2 = decryptRange(tmpFilePath, fileKey, fileId, totalSize, spanStart, spanEnd);
			expect(range2.equals(testPlaintext.subarray(spanStart, spanEnd + 1))).toBe(true);

			// Test 3: Range spanning into the final chunk
			const finalStart = totalSize - 1000;
			const finalEnd = totalSize - 1;
			const range3 = decryptRange(tmpFilePath, fileKey, fileId, totalSize, finalStart, finalEnd);
			expect(range3.equals(testPlaintext.subarray(finalStart, totalSize))).toBe(true);
		} finally {
			if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath);
		}
	});

	it('should perform Crypto-Shredding and render all event data unreadable', () => {
		const eventId = 'shred-me-event';
		const eventKey = generateEventKey(eventId);
		const aad = `events:${eventId}:title`;
		const encrypted = encryptText('Super Secret Birthday Title', eventKey, aad);

		// Verify readable before shredding
		expect(decryptText(encrypted, getEventKey(eventId), aad)).toBe('Super Secret Birthday Title');

		// Perform Crypto-Shredding
		const shredded = shredEventKey(eventId);
		expect(shredded).toBe(true);

		// Event key must no longer be retrievable
		expect(() => getEventKey(eventId)).toThrow(/shredded|not found/i);
	});
});
