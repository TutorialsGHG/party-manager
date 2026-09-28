import argon2 from 'argon2';

/**
 * Hashes a user password using Argon2id with OWASP-recommended parameters.
 */
export async function hashPassword(password: string): Promise<string> {
	return argon2.hash(password, {
		type: argon2.argon2id,
		memoryCost: 65536, // 64 MiB
		timeCost: 3,
		parallelism: 4
	});
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
	try {
		return await argon2.verify(hash, password);
	} catch {
		return false;
	}
}
