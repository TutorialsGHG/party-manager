import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Returns the authenticated user or throws 401.
 *
 * Replaces the bare `locals.user!` non-null assertions in route handlers. With the
 * assertion, an anonymous POST hit a TypeError inside the handler and surfaced as
 * HTTP 500 instead of a proper 401, which is both misleading and an easy way to
 * turn an authorization gap into a crash.
 */
export function requireUser(locals: App.Locals): NonNullable<App.Locals['user']> {
	if (!locals.user) {
		throw error(401, 'Nicht angemeldet.');
	}
	return locals.user;
}

/**
 * Convenience wrapper for `+server.ts` handlers.
 */
export function requireUserFrom(event: Pick<RequestEvent, 'locals'>) {
	return requireUser(event.locals);
}
