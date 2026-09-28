import type { Handle } from '@sveltejs/kit';
import { runMigrations } from '$lib/server/db/migrate';
import { initMasterKeys } from '$lib/server/crypto/master-key';
import { validateSession, SESSION_COOKIE_NAME } from '$lib/server/auth/session';

// Run migrations and crypto init on server boot
try {
	initMasterKeys();
	runMigrations();
} catch (err) {
	console.error('Initialization error in hooks.server.ts:', err);
}

export const handle: Handle = async ({ event, resolve }) => {
	// 1. Session resolution
	const sessionToken = event.cookies.get(SESSION_COOKIE_NAME);
	if (sessionToken) {
		const sessionUser = validateSession(sessionToken);
		event.locals.user = sessionUser;
	} else {
		event.locals.user = null;
	}

	// 2. Resolve request
	const response = await resolve(event);

	// 3. Strict Security Headers
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');

	// CSP: Strictest local self policy with zero external hosts allowed
	response.headers.set(
		'Content-Security-Policy',
		"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none';"
	);

	return response;
};
