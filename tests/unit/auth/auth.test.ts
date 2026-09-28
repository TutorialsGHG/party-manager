import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import { getDb } from '../../../src/lib/server/db/client';
import { hashPassword, verifyPassword } from '../../../src/lib/server/auth/password';
import { generateRecoveryCodes, verifyCodeHash } from '../../../src/lib/server/auth/recovery';
import { createPoWChallenge, verifyPoWSolution } from '../../../src/lib/server/auth/pow';
import {
	generateTotpSecret,
	generateTotpCode,
	verifyTotpCode
} from '../../../src/lib/server/auth/totp';
import {
	createUser,
	findUserByEmail
} from '../../../src/lib/server/db/repositories/user.repository';
import {
	createSession,
	validateSession,
	deleteSession
} from '../../../src/lib/server/auth/session';
import crypto from 'node:crypto';

describe('Auth, Database & Security Primitives', () => {
	beforeAll(() => {
		// Run database migrations on fresh test database
		runMigrations();
		const db = getDb();
		db.prepare('DELETE FROM recovery_codes').run();
		db.prepare('DELETE FROM sessions').run();
		db.prepare('DELETE FROM users').run();
	});

	it('should hash and verify passwords with Argon2id', async () => {
		const password = 'SuperSecurePassword!123';
		const hash = await hashPassword(password);
		expect(hash).toContain('$argon2id$');

		const isValid = await verifyPassword(hash, password);
		expect(isValid).toBe(true);

		const isInvalid = await verifyPassword(hash, 'WrongPassword');
		expect(isInvalid).toBe(false);
	});

	it('should generate 10 unique recovery codes and verify hashes in constant time', () => {
		const codes = generateRecoveryCodes(10);
		expect(codes).toHaveLength(10);

		for (const pair of codes) {
			expect(pair.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
			expect(verifyCodeHash(pair.code, pair.codeHash)).toBe(true);
			expect(verifyCodeHash('INVALID-CODE', pair.codeHash)).toBe(false);
		}
	});

	it('should generate and verify Proof-of-Work solutions', () => {
		const challenge = createPoWChallenge(3); // 3 hex zeros for fast test
		expect(challenge.challenge).toBeDefined();

		// Solve the challenge
		let nonce = 0;
		while (true) {
			const hash = crypto
				.createHash('sha256')
				.update(`${challenge.challenge}${nonce}`)
				.digest('hex');
			if (hash.startsWith('000')) {
				break;
			}
			nonce++;
		}

		const isValid = verifyPoWSolution(
			challenge.challenge,
			nonce,
			challenge.difficulty,
			challenge.expiresAt,
			challenge.signature
		);
		expect(isValid).toBe(true);

		// Tampered challenge must fail
		const isTampered = verifyPoWSolution(
			'tampered-challenge',
			nonce,
			challenge.difficulty,
			challenge.expiresAt,
			challenge.signature
		);
		expect(isTampered).toBe(false);
	});

	it('should generate and verify RFC 6238 TOTP codes with drift tolerance', () => {
		const secret = generateTotpSecret();
		expect(secret.length).toBeGreaterThanOrEqual(16);

		const code = generateTotpCode(secret);
		expect(code).toMatch(/^\d{6}$/);

		const isValid = verifyTotpCode(secret, code);
		expect(isValid).toBe(true);

		const isInvalid = verifyTotpCode(secret, '999999');
		expect(isInvalid).toBe(false);
	});

	it('should register first user as admin and subsequent users as host', async () => {
		const email1 = 'admin@party.local';
		const pwdHash1 = await hashPassword('AdminPass123!');
		const codes1 = generateRecoveryCodes(10).map((c) => c.codeHash);

		const { user: user1, isFirstUser: isFirst1 } = createUser(email1, pwdHash1, codes1);
		expect(isFirst1).toBe(true);
		expect(user1.role).toBe('admin');

		// Second user
		const email2 = 'host@party.local';
		const pwdHash2 = await hashPassword('HostPass123!');
		const codes2 = generateRecoveryCodes(10).map((c) => c.codeHash);

		const { user: user2, isFirstUser: isFirst2 } = createUser(email2, pwdHash2, codes2);
		expect(isFirst2).toBe(false);
		expect(user2.role).toBe('host');

		// Find by email
		const found = findUserByEmail('ADMIN@PARTY.LOCAL');
		expect(found).not.toBeNull();
		expect(found!.user.id).toBe(user1.id);
	});

	it('should manage user sessions with cryptographically secure token hashes', () => {
		const db = getDb();
		const userRow = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string };

		const { token, expiresAt } = createSession(userRow.id);
		expect(token).toBeDefined();
		expect(expiresAt).toBeGreaterThan(Date.now());

		const sessionUser = validateSession(token);
		expect(sessionUser).not.toBeNull();
		expect(sessionUser!.id).toBe(userRow.id);

		// Delete session
		deleteSession(token);
		const afterDelete = validateSession(token);
		expect(afterDelete).toBeNull();
	});
});
