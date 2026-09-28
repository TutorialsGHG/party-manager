import { redirect, type RequestHandler } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME, deleteSession, clearSessionCookie } from '$lib/server/auth/session';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE_NAME);
	if (token) {
		deleteSession(token);
		clearSessionCookie(cookies);
	}
	throw redirect(303, '/login');
};

export const GET: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE_NAME);
	if (token) {
		deleteSession(token);
		clearSessionCookie(cookies);
	}
	throw redirect(303, '/login');
};
