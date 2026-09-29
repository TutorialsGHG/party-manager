import type { Handle } from '@sveltejs/kit';
import { runMigrations } from '$lib/server/db/migrate';
import { initMasterKeys } from '$lib/server/crypto/master-key';
import { validateSession, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { config } from '$lib/server/config/env';

// Run migrations and crypto init on server boot.
// Fail closed: a half-initialized instance (master key unusable, schema missing)
// previously kept serving requests and only surfaced as scattered HTTP 500s, while
// the health endpoint still reported success. The operator has to know at boot.
try {
	initMasterKeys();
	runMigrations();
} catch (err) {
	console.error('FATAL: initialization failed, refusing to start:', err);
	process.exit(1);
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

	// HSTS only when the app is actually served over TLS; sending it over plain
	// HTTP would be meaningless and would pin self-hosted plain-HTTP setups.
	if (config.baseUrl.startsWith('https://')) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	// Authenticated pages must never be cached by a reverse proxy sitting in
	// front of the app: /dashboard, /admin and /events/[id] carry event titles,
	// guest names and host e-mail addresses. EventSource and media responses
	// manage their own cache headers.
	const contentType = response.headers.get('content-type') || '';
	const isStream = contentType.includes('text/event-stream');
	if (!isStream && contentType.includes('text/html')) {
		response.headers.set('Cache-Control', 'private, no-store');
		response.headers.set('Vary', 'Cookie');
	}

	// CSP: Strictest local self policy with zero external hosts allowed
	response.headers.set(
		'Content-Security-Policy',
		"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none';"
	);

	return response;
};
