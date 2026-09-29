import argon2 from 'argon2';

/**
 * Argon2id parameters used for real password hashes.
 */
const ARGON2_OPTIONS: argon2.HashOptions & { raw?: false } = {
	type: argon2.argon2id,
	memoryCost: 65536, // 64 MiB
	timeCost: 3,
	parallelism: 4
};

/**
 * A syntactically valid Argon2id hash of a value nobody knows.
 *
 * Verifying against it costs exactly as much as verifying a real stored hash,
 * which is what makes the "wrong password" and "unknown account" paths of the
 * login and the registration indistinguishable in wall-clock time. Without it
 * the response time alone reveals whether an e-mail address is registered.
 *
 * The parameters must stay in sync with ARGON2_OPTIONS above, otherwise the
 * timing gap reopens.
 */
export const DUMMY_ARGON2_HASH =
	'$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$P1d9P7J3uJvU1wFv3J0O9g';

/**
 * Hashes a user password using Argon2id with OWASP-recommended parameters.
 */
export async function hashPassword(password: string): Promise<string> {
	return argon2.hash(password, ARGON2_OPTIONS);
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
