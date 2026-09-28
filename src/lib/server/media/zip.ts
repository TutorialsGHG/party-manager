import zlib from 'node:zlib';

export interface ZipEntry {
	name: string;
	data: Buffer | Uint8Array;
	date?: Date;
}

/**
 * Creates an uncompressed ZIP archive (STORE mode) from in-memory file buffers.
 * Zero external dependencies, fast, and ideal for images/videos that are already compressed.
 */
export function createZipArchive(entries: ZipEntry[]): Buffer {
	const localHeadersAndData: Buffer[] = [];
	const centralDirEntries: Buffer[] = [];
	let offset = 0;

	// Deduplicate names if multiple files have the same name
	const usedNames = new Set<string>();

	for (const entry of entries) {
		let filename = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
		if (!filename) filename = 'file';

		// Handle duplicate filenames
		if (usedNames.has(filename)) {
			const dotIdx = filename.lastIndexOf('.');
			const base = dotIdx !== -1 ? filename.slice(0, dotIdx) : filename;
			const ext = dotIdx !== -1 ? filename.slice(dotIdx) : '';
			let counter = 1;
			while (usedNames.has(`${base}_${counter}${ext}`)) {
				counter++;
			}
			filename = `${base}_${counter}${ext}`;
		}
		usedNames.add(filename);

		const filenameBuffer = Buffer.from(filename, 'utf-8');
		const dataBuffer = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
		const size = dataBuffer.length;
		const crc = zlib.crc32(dataBuffer);

		const date = entry.date || new Date();
		const dosTime =
			((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
		const dosDate =
			(((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;

		// Local file header (30 bytes + name length)
		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
		localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
		localHeader.writeUInt16LE(0x0800, 6); // Flags (bit 11 = UTF-8)
		localHeader.writeUInt16LE(0, 8); // Compression (0 = STORE)
		localHeader.writeUInt16LE(dosTime, 10);
		localHeader.writeUInt16LE(dosDate, 12);
		localHeader.writeUInt32LE(crc, 14);
		localHeader.writeUInt32LE(size, 18); // Compressed size
		localHeader.writeUInt32LE(size, 22); // Uncompressed size
		localHeader.writeUInt16LE(filenameBuffer.length, 26);
		localHeader.writeUInt16LE(0, 28); // Extra field length

		localHeadersAndData.push(localHeader, filenameBuffer, dataBuffer);

		// Central directory entry (46 bytes + name length)
		const cdHeader = Buffer.alloc(46);
		cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
		cdHeader.writeUInt16LE(20, 4); // Version made by
		cdHeader.writeUInt16LE(20, 6); // Version needed
		cdHeader.writeUInt16LE(0x0800, 8); // Flags (UTF-8)
		cdHeader.writeUInt16LE(0, 10); // Compression (STORE)
		cdHeader.writeUInt16LE(dosTime, 12);
		cdHeader.writeUInt16LE(dosDate, 14);
		cdHeader.writeUInt32LE(crc, 16);
		cdHeader.writeUInt32LE(size, 20);
		cdHeader.writeUInt32LE(size, 24);
		cdHeader.writeUInt16LE(filenameBuffer.length, 28);
		cdHeader.writeUInt16LE(0, 30); // Extra field length
		cdHeader.writeUInt16LE(0, 32); // File comment length
		cdHeader.writeUInt16LE(0, 34); // Disk number start
		cdHeader.writeUInt16LE(0, 36); // Internal file attributes
		cdHeader.writeUInt32LE(0, 38); // External file attributes
		cdHeader.writeUInt32LE(offset, 42); // Relative offset of local header

		centralDirEntries.push(cdHeader, filenameBuffer);

		offset += localHeader.length + filenameBuffer.length + dataBuffer.length;
	}

	const centralDirOffset = offset;
	const centralDirBuffer = Buffer.concat(centralDirEntries);
	const centralDirSize = centralDirBuffer.length;

	// End of Central Directory Record (22 bytes)
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
	eocd.writeUInt16LE(0, 4); // Disk number
	eocd.writeUInt16LE(0, 6); // Disk start
	eocd.writeUInt16LE(entries.length, 8); // Records on this disk
	eocd.writeUInt16LE(entries.length, 10); // Total records
	eocd.writeUInt32LE(centralDirSize, 12);
	eocd.writeUInt32LE(centralDirOffset, 16);
	eocd.writeUInt16LE(0, 20); // Comment length

	return Buffer.concat([...localHeadersAndData, centralDirBuffer, eocd]);
}
