import { redirect, type RequestHandler } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME, deleteSession, clearSessionCookie } from '$lib/server/auth/session';

function endSession(cookies: import('@sveltejs/kit').Cookies) {
	const token = cookies.get(SESSION_COOKIE_NAME);
	if (token) {
		deleteSession(token);
		clearSessionCookie(cookies);
	}
}

/**
 * Logout is state-changing, so it must be a POST.
 *
 * As a GET it could be triggered cross-site (an <img> tag or a link is enough);
 * SvelteKit's checkOrigin only guards unsafe methods, so the GET variant bypassed
 * the CSRF protection the app otherwise relies on.
 */
export const POST: RequestHandler = async ({ cookies }) => {
	endSession(cookies);
	throw redirect(303, '/login');
};

/**
 * GET only redirects, it never invalidates the session.
 */
export const GET: RequestHandler = async () => {
	throw redirect(303, '/login');
};
