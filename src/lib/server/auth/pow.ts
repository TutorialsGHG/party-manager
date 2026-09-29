import crypto from 'node:crypto';

const POW_SECRET = process.env.POW_SECRET || crypto.randomBytes(32).toString('hex'); // Stable across restarts/clusters when configured
const DEFAULT_DIFFICULTY = 4; // 4 hex zeros, fast for legitimate users (~100-300ms in modern browsers)
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface PoWChallenge {
	challenge: string;
	difficulty: number;
	expiresAt: number;
	signature: string;
}

/**
 * Server-side record of challenges that were already spent.
 *
 * The HMAC signature proves a solution was produced for a server-issued challenge,
 * but on its own it is replayable: the same (challenge, nonce) pair could be
 * resubmitted within the TTL to create unlimited accounts. Marking a challenge as
 * consumed makes each proof strictly single-use.
 */
const consumedChallenges = new Map<string, number>();

function pruneConsumed(): void {
	const now = Date.now();
	for (const [challenge, expiresAt] of consumedChallenges) {
		if (expiresAt < now) consumedChallenges.delete(challenge);
	}
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
	try {
		if (typeof challenge !== 'string' || challenge.length === 0) return false;
		if (typeof nonce !== 'string' && typeof nonce !== 'number') return false;
		if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;

		if (Date.now() > expiresAt) {
			return false; // Expired
		}

		// Single-use: a solution may be redeemed exactly once.
		pruneConsumed();
		if (consumedChallenges.has(challenge)) return false;

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

		const requiredPrefix = '0'.repeat(Math.max(0, Math.min(64, difficulty)));
		if (!hash.startsWith(requiredPrefix)) return false;

		consumedChallenges.set(challenge, Date.now() + CHALLENGE_TTL_MS);
		return true;
	} catch {
		// Never let a malformed submission turn into an HTTP 500.
		return false;
	}
}
