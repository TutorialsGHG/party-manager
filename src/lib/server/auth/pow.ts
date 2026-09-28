import crypto from 'node:crypto';

const POW_SECRET = crypto.randomBytes(32); // Generated on process start
const DEFAULT_DIFFICULTY = 4; // 4 hex zeros, fast for legitimate users (~100-300ms in modern browsers)
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface PoWChallenge {
	challenge: string;
	difficulty: number;
	expiresAt: number;
	signature: string;
}

function signChallenge(challenge: string, difficulty: number, expiresAt: number): string {
	return crypto
		.createHmac('sha256', POW_SECRET)
		.update(`${challenge}:${difficulty}:${expiresAt}`)
		.digest('hex');
}

export function createPoWChallenge(difficulty = DEFAULT_DIFFICULTY): PoWChallenge {
	const challenge = crypto.randomBytes(16).toString('hex');
	const expiresAt = Date.now() + CHALLENGE_TTL_MS;
	const signature = signChallenge(challenge, difficulty, expiresAt);

	return {
		challenge,
		difficulty,
		expiresAt,
		signature
	};
}

export function verifyPoWSolution(
	challenge: string,
	nonce: string | number,
	difficulty: number,
	expiresAt: number,
	signature: string
): boolean {
	if (Date.now() > expiresAt) {
		return false; // Expired
	}

	// Verify HMAC signature to prevent forged difficulty or fake challenges
	const expectedSig = signChallenge(challenge, difficulty, expiresAt);
	if (
		signature.length !== expectedSig.length ||
		!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'))
	) {
		return false;
	}

	// Verify SHA-256 solution
	const hash = crypto.createHash('sha256').update(`${challenge}${nonce}`).digest('hex');

	const requiredPrefix = '0'.repeat(difficulty);
	return hash.startsWith(requiredPrefix);
}
