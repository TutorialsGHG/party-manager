import crypto from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { getDb } from '../db/client';
import { config } from '../config/env';

/**
 * Whether cookies must carry the `secure` flag.
 *
 * Deliberately NOT derived from NODE_ENV: a bare-metal or systemd deploy that runs
 * `node build/index.js` without NODE_ENV=production silently fell back to
 * `secure: false` and shipped session tokens in cleartext over plain HTTP. The
 * transport that actually serves the app is the right source of truth.
 */
export const isHttpsBaseUrl = (baseUrl: string): boolean => {
	try {
		return new URL(baseUrl).protocol === 'https:';
	} catch {
		return false;
	}
};

const isHttps = (): boolean => isHttpsBaseUrl(config.baseUrl);

/**
 * Cookie name for a given transport.
 *
 * The `__Host-` prefix is spec-mandated to be `Secure` and `Path=/` with no
 * `Domain`, so it may only be used when the app is actually served over TLS.
 * Deriving the name from NODE_ENV (as this did before) desynchronised it from
 * the `secure` flag: a bare-metal deploy with NODE_ENV=production but an http
 * BASE_URL produced a `__Host-` cookie *without* the mandatory Secure flag,
 * which browsers reject outright - every login silently failed. Name and flag
 * now come from the same source of truth, so this is a pure function of the
 * transport rather than a module-level constant that can drift.
 */
export const sessionCookieName = (https: boolean): string => (https ? '__Host-session' : 'session');

export const SESSION_COOKIE_NAME = sessionCookieName(isHttps());
export const SESSION_DURATION_DAYS = 30;
export const SESSION_IDLE_DAYS = 7;

export interface SessionUser {
	id: string;
	role: string;
	isActive: boolean;
}

export function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a new session for a user in the database.
 * Returns the raw token to be set in the cookie.
 */
export function createSession(userId: string): { token: string; expiresAt: number } {
	const token = crypto.randomBytes(32).toString('base64url');
	const tokenHash = hashToken(token);
	const sessionId = crypto.randomUUID();
	const now = Date.now();
	const expiresAt = now + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

	const db = getDb();
	db.prepare(
		`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `
	).run(sessionId, userId, tokenHash, expiresAt, now, now);

	return { token, expiresAt };
}

/**
 * Validates a session token and returns the associated user if valid.
 */
export function validateSession(token: string): SessionUser | null {
	if (!token || typeof token !== 'string') return null;

	const tokenHash = hashToken(token);
	const db = getDb();

	const row = db
		.prepare(
			`
      SELECT s.id as session_id, s.expires_at, s.last_seen_at, u.id as user_id, u.role, u.is_active
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = ?
    `
		)
		.get(tokenHash) as
		| {
				session_id: string;
				expires_at: number;
				last_seen_at: number | null;
				user_id: string;
				role: string;
				is_active: number;
		  }
		| undefined;

	if (!row) return null;

	if (Date.now() > row.expires_at || !row.is_active) {
		// Session expired or user disabled
		db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
		return null;
	}

	// Idle timeout: a stolen cookie must stop working once the owner goes quiet.
	// Sessions created before migration 005 have no last_seen_at; fall back to
	// created_at semantics by leaving them valid.
	if (row.last_seen_at && Date.now() - row.last_seen_at > SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000) {
		db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
		return null;
	}

	// Refresh activity (throttled implicitly: one write per validated request)
	db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(Date.now(), row.session_id);

	return {
		id: row.user_id,
		role: row.role,
		isActive: !!row.is_active
	};
}

/**
 * Invalidates (deletes) a session token.
 */
export function deleteSession(token: string) {
	if (!token) return;
	const tokenHash = hashToken(token);
	getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

/**
 * Helper to set standard hardened session cookie.
 */
export function setSessionCookie(cookies: Cookies, token: string, expiresAt: number) {
	cookies.set(SESSION_COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		secure: isHttps(),
		sameSite: 'lax',
		expires: new Date(expiresAt)
	});
}

/**
 * Helper to clear session cookie.
 */
export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE_NAME, {
		path: '/',
		httpOnly: true,
		secure: isHttps(),
		sameSite: 'lax'
	});
}
