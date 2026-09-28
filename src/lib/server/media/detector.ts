export interface DetectedMedia {
	mimeType: string;
	extension: string;
	type: 'image' | 'video';
}

/**
 * Sniffs the magic bytes of a buffer to detect the authentic media format.
 * Never trust client-supplied extensions or Content-Type headers.
 */
export function detectMagicBytes(buffer: Buffer): DetectedMedia | null {
	if (buffer.length < 12) {
		return null;
	}

	// 1. JPEG: FF D8 FF
	if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return {
			mimeType: 'image/jpeg',
			extension: 'jpg',
			type: 'image'
		};
	}

	// 2. PNG: 89 50 4E 47 0D 0A 1A 0A
	if (
		buffer.length >= 8 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47 &&
		buffer[4] === 0x0d &&
		buffer[5] === 0x0a &&
		buffer[6] === 0x1a &&
		buffer[7] === 0x0a
	) {
		return {
			mimeType: 'image/png',
			extension: 'png',
			type: 'image'
		};
	}

	// 3. WebP: RIFF .... WEBP
	if (
		buffer.length >= 12 &&
		buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
		buffer.subarray(8, 12).toString('ascii') === 'WEBP'
	) {
		return {
			mimeType: 'image/webp',
			extension: 'webp',
			type: 'image'
		};
	}

	// 4. MP4 / MOV / HEIC / HEIF based on ISO Base Media File Format (ftyp box)
	if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
		const majorBrand = buffer.subarray(8, 12).toString('ascii').toLowerCase();

		// Check for HEIC / HEIF
		const heicBrands = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'];
		if (heicBrands.some((b) => majorBrand.startsWith(b))) {
			return {
				mimeType: 'image/heic',
				extension: 'heic',
				type: 'image'
			};
		}

		// Check for QuickTime MOV
		if (majorBrand.startsWith('qt')) {
			return {
				mimeType: 'video/quicktime',
				extension: 'mov',
				type: 'video'
			};
		}

		// Default to MP4 for other ftyp media (isom, iso2, mp41, mp42, etc.)
		return {
			mimeType: 'video/mp4',
			extension: 'mp4',
			type: 'video'
		};
	}

	// 5. WebM / Matroska: 1A 45 DF A3
	if (
		buffer.length >= 4 &&
		buffer[0] === 0x1a &&
		buffer[1] === 0x45 &&
		buffer[2] === 0xdf &&
		buffer[3] === 0xa3
	) {
		return {
			mimeType: 'video/webm',
			extension: 'webm',
			type: 'video'
		};
	}

	return null;
}
