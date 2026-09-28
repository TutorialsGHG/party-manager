import crypto from 'node:crypto';

export interface RecoveryCodePair {
	code: string; // Formatted plaintext for the user, e.g. "ABCD-EFGH"
	codeHash: string; // SHA-256 hex hash stored in the database
}

export function hashRecoveryCode(code: string): string {
	const normalized = code
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');
	return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generates 10 secure, human-readable one-time recovery codes.
 */
export function generateRecoveryCodes(count = 10): RecoveryCodePair[] {
	const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Base32 without ambiguous 0/O, 1/I
	const pairs: RecoveryCodePair[] = [];

	for (let i = 0; i < count; i++) {
		const bytes = crypto.randomBytes(8);
		let code = '';
		for (let b = 0; b < 8; b++) {
			code += chars[bytes[b] % chars.length];
			if (b === 3) code += '-';
		}

		pairs.push({
			code,
			codeHash: hashRecoveryCode(code)
		});
	}

	return pairs;
}

/**
 * Compares two hashes in constant time to prevent timing attacks.
 */
export function verifyCodeHash(inputCode: string, storedHash: string): boolean {
	const inputHash = hashRecoveryCode(inputCode);
	return crypto.timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(storedHash, 'hex'));
}
