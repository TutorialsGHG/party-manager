import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env';
import { encryptWithMasterPublicKey, decryptWithMasterKey } from './master-key';

interface CachedKey {
	key: Buffer;
	expiresAt: number;
}

const LRU_TTL_MS = 15 * 60 * 1000; // 15 minutes
const eventKeyCache = new Map<string, CachedKey>();

function ensureEventKeyDir() {
	if (!fs.existsSync(config.eventsKeyDir)) {
		fs.mkdirSync(config.eventsKeyDir, { recursive: true });
	}
}

export function getEventKeyFilePath(eventId: string): string {
	// Sanitize eventId to prevent path traversal
	const safeId = eventId.replace(/[^a-zA-Z0-9_-]/g, '');
	return path.join(config.eventsKeyDir, `${safeId}.key`);
}

/**
 * Generates a fresh 256-bit Event Key (EK), wraps it via RSA-OAEP with Master Public Key,
 * stores it in the keystore, and caches it in memory.
 */
export function generateEventKey(eventId: string): Buffer {
	ensureEventKeyDir();
	const rawKey = crypto.randomBytes(32);
	const wrappedKey = encryptWithMasterPublicKey(rawKey);

	const filePath = getEventKeyFilePath(eventId);
	fs.writeFileSync(filePath, wrappedKey, { mode: 0o600 });

	eventKeyCache.set(eventId, {
		key: rawKey,
		expiresAt: Date.now() + LRU_TTL_MS
	});

	return rawKey;
}

/**
 * Retrieves the Event Key for an event.
 * Uses LRU in-memory cache first; on cache miss, unwraps via Master Private Key.
 */
export function getEventKey(eventId: string): Buffer {
	const cached = eventKeyCache.get(eventId);
	if (cached && cached.expiresAt > Date.now()) {
		// Reset TTL on access
		cached.expiresAt = Date.now() + LRU_TTL_MS;
		return cached.key;
	}

	const filePath = getEventKeyFilePath(eventId);
	if (!fs.existsSync(filePath)) {
		throw new Error(`Event key for event "${eventId}" not found. Key may have been shredded.`);
	}

	const wrappedKey = fs.readFileSync(filePath);
	const rawKey = decryptWithMasterKey(wrappedKey);

	eventKeyCache.set(eventId, {
		key: rawKey,
		expiresAt: Date.now() + LRU_TTL_MS
	});

	return rawKey;
}

/**
 * Evicts an Event Key from the in-memory cache.
 */
export function evictEventKey(eventId: string) {
	eventKeyCache.delete(eventId);
}

/**
 * Encrypts a text string with an Event Key using AES-256-GCM.
 * Format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptText(text: string, eventKey: Buffer, aad: string): string {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', eventKey, iv);
	cipher.setAAD(Buffer.from(aad, 'utf8'));

	const ciphertext = Buffer.concat([cipher.update(Buffer.from(text, 'utf8')), cipher.final()]);
	const tag = cipher.getAuthTag();

	return `${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

/**
 * Decrypts a text string with an Event Key using AES-256-GCM.
 * Validates AuthTag and AAD.
 */
export function decryptText(payload: string, eventKey: Buffer, aad: string): string {
	const parts = payload.split(':');
	if (parts.length !== 3) {
		throw new Error('Invalid encrypted payload format.');
	}

	const iv = Buffer.from(parts[0], 'base64url');
	const tag = Buffer.from(parts[1], 'base64url');
	const ciphertext = Buffer.from(parts[2], 'base64url');

	const decipher = crypto.createDecipheriv('aes-256-gcm', eventKey, iv);
	decipher.setAuthTag(tag);
	decipher.setAAD(Buffer.from(aad, 'utf8'));

	const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return plaintext.toString('utf8');
}
