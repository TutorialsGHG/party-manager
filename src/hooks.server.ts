import type { Handle } from '@sveltejs/kit';
import { runMigrations } from '$lib/server/db/migrate';
import { initMasterKeys } from '$lib/server/crypto/master-key';
import { validateSession, SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { config } from '$lib/server/config/env';
import { MediaRepository } from '$lib/server/db/repositories/media.repository';

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

/**
 * Abandoned upload sessions keep their media row and a temp tail file forever,
 * because the DELETE path only runs when a client cooperates (tab closed, network
 * drop, reload). Sweep them at boot and once a day afterwards: a guest must not be
 * able to exhaust the per-event quota by opening sessions and never uploading.
 */
const ABANDONED_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

function sweepAbandonedUploads(): void {
	try {
		const removed = MediaRepository.cleanupAbandonedUploads(ABANDONED_UPLOAD_MAX_AGE_MS);
		if (removed > 0) {
			console.log(`Cleaned up ${removed} abandoned upload session(s)`);
		}
	} catch (err) {
		// Never let a maintenance task take the server down.
		console.error('Abandoned upload cleanup failed:', err);
	}
}

sweepAbandonedUploads();
const cleanupTimer = setInterval(sweepAbandonedUploads, CLEANUP_INTERVAL_MS);
// Do not keep the event loop alive just for the cleanup job.
cleanupTimer.unref?.();

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
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
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

	// CSP: Strictest local self policy with zero external hosts allowed except embedded party playlists
	response.headers.set(
		'Content-Security-Policy',
		"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://open.spotify.com; frame-ancestors 'none';"
	);

	return response;
};
