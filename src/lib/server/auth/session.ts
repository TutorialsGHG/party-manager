import crypto from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { getDb } from '../db/client';
import { config } from '../config/env';

export const SESSION_COOKIE_NAME = config.isProduction ? '__Host-session' : 'session';
export const SESSION_DURATION_DAYS = 30;

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
  const expiresAt = Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

  const db = getDb();
  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, userId, tokenHash, expiresAt, Date.now());

  return { token, expiresAt };
}

/**
 * Validates a session token and returns the associated user if valid.
 */
export function validateSession(token: string): SessionUser | null {
  if (!token || typeof token !== 'string') return null;

  const tokenHash = hashToken(token);
  const db = getDb();

  const row = db.prepare(`
    SELECT s.id as session_id, s.expires_at, u.id as user_id, u.role, u.is_active
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ?
  `).get(tokenHash) as { session_id: string; expires_at: number; user_id: string; role: string; is_active: number } | undefined;

  if (!row) return null;

  if (Date.now() > row.expires_at || !row.is_active) {
    // Session expired or user disabled
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }

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
    secure: config.isProduction,
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
    secure: config.isProduction,
    sameSite: 'lax'
  });
}