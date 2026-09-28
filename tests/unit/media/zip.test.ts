import { describe, it, expect } from 'vitest';
import { createZipArchive } from '../../../src/lib/server/media/zip.js';

describe('Zip Utility', () => {
	it('creates a valid empty zip archive', () => {
		const zipBuffer = createZipArchive([]);
		expect(zipBuffer.length).toBe(22); // EOCD is 22 bytes
		expect(zipBuffer.subarray(0, 4).toString('hex')).toBe('504b0506'); // PK\x05\x06
	});

	it('creates a valid zip archive with files and handles duplicate names', () => {
		const entries = [
			{ name: 'photo.jpg', data: Buffer.from('hello-photo') },
			{ name: 'photo.jpg', data: Buffer.from('hello-photo-duplicate') },
			{ name: 'nested/note.txt', data: Buffer.from('party note') }
		];

		const zipBuffer = createZipArchive(entries);
		expect(zipBuffer.length).toBeGreaterThan(100);
		expect(zipBuffer.subarray(0, 4).toString('hex')).toBe('504b0304'); // PK\x03\x04
	});
});
