import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import * as blurhash from 'blurhash';
import { MediaRepository } from '$lib/server/db/media.repository.js';
import { readBlobAsPlaintext, writePlaintextAsBlob } from '$lib/server/storage/blob-store.js';
import { detectMagicBytes } from './detector.js';
import { sseHub } from '$lib/server/realtime/sse-hub.js';
import { config } from '$lib/server/config/env.js';

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(config.blobsDir, 'temp');

function ensureTempDir() {
	if (!fs.existsSync(TEMP_DIR)) {
		fs.mkdirSync(TEMP_DIR, { recursive: true });
	}
}

/**
 * Checks if ffmpeg is accessible on this machine.
 */
export async function isFfmpegAvailable(): Promise<boolean> {
	try {
		await execFileAsync('ffmpeg', ['-version']);
		return true;
	} catch {
		return false;
	}
}

/**
 * Processes an uploaded media file:
 * - Decrypts original
 * - Verifies magic bytes
 * - Generates Blurhash, WebP thumbnail, and web-optimized version
 * - Transcodes video with ffmpeg (if video)
 * - Encrypts derived files
 * - Broadcasts SSE update
 */
export async function processMedia(mediaId: string): Promise<void> {
	const keys = MediaRepository.getMediaKeys(mediaId);
	if (!keys) {
		throw new Error(`Media not found for processing: ${mediaId}`);
	}

	MediaRepository.updateStatus(mediaId, 'processing');

	try {
		// 1. Read decrypted original
		const originalPlaintext = readBlobAsPlaintext(
			mediaId,
			keys.fileKey,
			keys.totalPlaintextSize,
			'original'
		);

		// 2. Validate magic bytes
		const detected = detectMagicBytes(originalPlaintext);
		if (!detected) {
			throw new Error(`File has invalid or unrecognized magic bytes.`);
		}

		if (detected.type === 'image') {
			await processImage(mediaId, originalPlaintext, keys);
		} else {
			await processVideo(mediaId, originalPlaintext, keys);
		}

		// Fetch the updated item and broadcast via SSE
		const updated = MediaRepository.getById(mediaId);
		if (updated) {
			sseHub.broadcast(keys.eventId, 'media:new', updated);
		}
	} catch (err) {
		console.error(`Error processing media ${mediaId}:`, err);
		MediaRepository.updateStatus(mediaId, 'failed');
		throw err;
	}
}

async function processImage(
	mediaId: string,
	plaintext: Buffer,
	keys: { fileKey: Buffer; salt: Buffer; eventId: string }
): Promise<void> {
	// 1. Generate Blurhash placeholder
	let blurhashStr: string | null = null;
	try {
		const { data, info } = await sharp(plaintext)
			.rotate()
			.resize(32, 32, { fit: 'inside' })
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });

		blurhashStr = blurhash.encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
	} catch (e) {
		console.warn(`Could not compute blurhash for ${mediaId}:`, e);
	}

	// 3. Web-optimized version (max 2048x2048 WebP)
	const webBuffer = await sharp(plaintext)
		.rotate()
		.resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
		.webp({ quality: 85 })
		.toBuffer();

	// 4. Thumbnail (400x400 cover WebP)
	const thumbBuffer = await sharp(plaintext)
		.rotate()
		.resize(400, 400, { fit: 'cover' })
		.webp({ quality: 80 })
		.toBuffer();

	// 5. Encrypt derivatives
	writePlaintextAsBlob(mediaId, webBuffer, keys.fileKey, keys.salt, 'web');
	writePlaintextAsBlob(mediaId, thumbBuffer, keys.fileKey, keys.salt, 'thumb');

	// 6. Update database record
	MediaRepository.updateProcessed(mediaId, {
		status: 'ready',
		processedSize: webBuffer.length,
		blurhash: blurhashStr,
		mimeType: 'image/webp'
	});
}

async function processVideo(
	mediaId: string,
	plaintext: Buffer,
	keys: { fileKey: Buffer; salt: Buffer; eventId: string }
): Promise<void> {
	ensureTempDir();
	const inputTmp = path.join(TEMP_DIR, `${mediaId}-raw.tmp`);
	const thumbTmp = path.join(TEMP_DIR, `${mediaId}-thumb.jpg`);
	const webTmp = path.join(TEMP_DIR, `${mediaId}-web.mp4`);

	fs.writeFileSync(inputTmp, plaintext);

	const durationSeconds: number | null = null;
	let blurhashStr: string | null = null;
	let webBufferSize: number | null = null;

	try {
		const hasFfmpeg = await isFfmpegAvailable();

		if (hasFfmpeg) {
			// 1. Extract poster frame at 1 second
			try {
				await execFileAsync('ffmpeg', [
					'-protocol_whitelist',
					'file,pipe',
					'-nostdin',
					'-ss',
					'00:00:01',
					'-i',
					inputTmp,
					'-vframes',
					'1',
					'-q:v',
					'2',
					'-y',
					thumbTmp
				]);
			} catch {
				// Fallback to 00:00:00 if 1s failed
				await execFileAsync('ffmpeg', [
					'-protocol_whitelist',
					'file,pipe',
					'-nostdin',
					'-ss',
					'00:00:00',
					'-i',
					inputTmp,
					'-vframes',
					'1',
					'-q:v',
					'2',
					'-y',
					thumbTmp
				]);
			}

			// Process poster frame for thumbnail & blurhash
			if (fs.existsSync(thumbTmp)) {
				const thumbRaw = fs.readFileSync(thumbTmp);
				try {
					const { data, info } = await sharp(thumbRaw)
						.resize(32, 32, { fit: 'inside' })
						.ensureAlpha()
						.raw()
						.toBuffer({ resolveWithObject: true });
					blurhashStr = blurhash.encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
				} catch {
					// ignore
				}

				const thumbBuffer = await sharp(thumbRaw)
					.resize(400, 400, { fit: 'cover' })
					.webp({ quality: 80 })
					.toBuffer();

				writePlaintextAsBlob(mediaId, thumbBuffer, keys.fileKey, keys.salt, 'thumb');
			}

			// 2. Transcode / remux with faststart
			try {
				await execFileAsync('ffmpeg', [
					'-protocol_whitelist',
					'file,pipe',
					'-nostdin',
					'-i',
					inputTmp,
					'-c:v',
					'libx264',
					'-preset',
					'fast',
					'-crf',
					'23',
					'-pix_fmt',
					'yuv420p',
					'-c:a',
					'aac',
					'-b:a',
					'128k',
					'-movflags',
					'+faststart',
					'-y',
					webTmp
				]);

				if (fs.existsSync(webTmp)) {
					const webBuf = fs.readFileSync(webTmp);
					webBufferSize = webBuf.length;
					writePlaintextAsBlob(mediaId, webBuf, keys.fileKey, keys.salt, 'web');
				}
			} catch (e) {
				console.warn(`Faststart transcode failed, falling back to original:`, e);
			}
		}

		MediaRepository.updateProcessed(mediaId, {
			status: 'ready',
			processedSize: webBufferSize,
			durationSeconds,
			blurhash: blurhashStr,
			mimeType: 'video/mp4'
		});
	} finally {
		// Clean up temporary unencrypted files securely
		if (fs.existsSync(inputTmp)) fs.unlinkSync(inputTmp);
		if (fs.existsSync(thumbTmp)) fs.unlinkSync(thumbTmp);
		if (fs.existsSync(webTmp)) fs.unlinkSync(webTmp);
	}
}
