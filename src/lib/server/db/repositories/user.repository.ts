import crypto from 'node:crypto';
import { getDb } from '../client';
import { encryptWithMasterPublicKey, decryptWithMasterKey } from '../../crypto/master-key';

export interface UserRecord {
	id: string;
	email: string;
	role: 'admin' | 'host';
	isActive: boolean;
	createdAt: number;
}

export function hashEmail(email: string): string {
	return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export function countUsers(): number {
	const row = getDb().prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
	return row ? row.count : 0;
}

export function createUser(
	email: string,
	passwordHash: string,
	recoveryCodeHashes: string[]
): { user: UserRecord; isFirstUser: boolean } {
	const db = getDb();
	const id = crypto.randomUUID();
	const emailClean = email.trim().toLowerCase();
	const emailHash = hashEmail(emailClean);

	// Encrypt email with Master Key (AES-GCM or RSA-OAEP)
	const encEmailBuf = encryptWithMasterPublicKey(Buffer.from(emailClean, 'utf8'));
	const emailCipher = encEmailBuf.toString('base64');

	// First registered user becomes admin!
	const isFirstUser = countUsers() === 0;
	const role = isFirstUser ? 'admin' : 'host';
	const now = Date.now();

	const createTx = db.transaction(() => {
		db.prepare(
			`
      INSERT INTO users (id, email_hash, email_cipher, password_hash, role, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `
		).run(id, emailHash, emailCipher, passwordHash, role, now);

		const insertCode = db.prepare(`
      INSERT INTO recovery_codes (id, user_id, code_hash)
      VALUES (?, ?, ?)
    `);

		for (const codeHash of recoveryCodeHashes) {
			insertCode.run(crypto.randomUUID(), id, codeHash);
		}
	});

	createTx();

	return {
		user: {
			id,
			email: emailClean,
			role,
			isActive: true,
			createdAt: now
		},
		isFirstUser
	};
}

export function findUserByEmail(email: string): { user: UserRecord; passwordHash: string } | null {
	const emailHash = hashEmail(email);
	const row = getDb()
		.prepare(
			`
    SELECT id, email_cipher, password_hash, role, is_active, created_at
    FROM users
    WHERE email_hash = ?
  `
		)
		.get(emailHash) as any;

	if (!row) return null;

	// Never fall back to the caller-supplied address on a decrypt error: that would
	// echo whatever the request claimed to be the stored value. Return an empty
	// string instead so a key mismatch cannot be turned into a spoofed identity.
	let decryptedEmail = '';
	try {
		const buf = decryptWithMasterKey(Buffer.from(row.email_cipher, 'base64'));
		decryptedEmail = buf.toString('utf8');
	} catch {
		// Key mismatch - the stored value stays unavailable.
	}

	return {
		user: {
			id: row.id,
			email: decryptedEmail,
			role: row.role,
			isActive: !!row.is_active,
			createdAt: row.created_at
		},
		passwordHash: row.password_hash
	};
}

export function findUserById(id: string): UserRecord | null {
	const row = getDb()
		.prepare(
			`
    SELECT id, email_cipher, role, is_active, created_at
    FROM users
    WHERE id = ?
  `
		)
		.get(id) as any;

	if (!row) return null;

	let decryptedEmail = '';
	try {
		const buf = decryptWithMasterKey(Buffer.from(row.email_cipher, 'base64'));
		decryptedEmail = buf.toString('utf8');
	} catch {
		// Fallback
	}

	return {
		id: row.id,
		email: decryptedEmail,
		role: row.role,
		isActive: !!row.is_active,
		createdAt: row.created_at
	};
}

export function verifyAndConsumeRecoveryCode(userId: string, codeHash: string): boolean {
	const db = getDb();
	const row = db
		.prepare(
			`
    SELECT id FROM recovery_codes
    WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
  `
		)
		.get(userId, codeHash) as { id: string } | undefined;

	if (!row) return false;

	db.prepare('UPDATE recovery_codes SET used_at = ? WHERE id = ?').run(Date.now(), row.id);
	return true;
}

export function replaceRecoveryCodes(userId: string, newCodeHashes: string[]) {
	const db = getDb();
	const tx = db.transaction(() => {
		db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
		const insertCode = db.prepare(
			'INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)'
		);
		for (const hash of newCodeHashes) {
			insertCode.run(crypto.randomUUID(), userId, hash);
		}
	});
	tx();
}

export function listUsers(): (UserRecord & { eventCount: number })[] {
	const db = getDb();
	const rows = db
		.prepare(
			`
    SELECT u.id, u.email_cipher, u.role, u.is_active, u.created_at,
           COUNT(e.id) as event_count
    FROM users u
    LEFT JOIN events e ON u.id = e.host_id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `
		)
		.all() as any[];

	return rows.map((row) => {
		let email: string;
		try {
			const buf = decryptWithMasterKey(Buffer.from(row.email_cipher, 'base64'));
			email = buf.toString('utf8');
		} catch {
			email = 'encrypted-user';
		}

		return {
			id: row.id,
			email,
			role: row.role,
			isActive: !!row.is_active,
			createdAt: row.created_at,
			eventCount: row.event_count || 0
		};
	});
}

export function setUserActive(id: string, isActive: boolean): boolean {
	const db = getDb();
	const res = db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
	return res.changes > 0;
}

export function setUserRole(id: string, role: 'admin' | 'host'): boolean {
	const db = getDb();
	const res = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
	return res.changes > 0;
}

export function deleteUser(id: string): boolean {
	const db = getDb();
	const res = db.prepare('DELETE FROM users WHERE id = ?').run(id);
	return res.changes > 0;
}
