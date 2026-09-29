import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { findUserByEmail } from '$lib/server/db/repositories/user.repository';
import { verifyPassword, DUMMY_ARGON2_HASH } from '$lib/server/auth/password';
import {
	createSession,
	deleteSession,
	setSessionCookie,
	SESSION_COOKIE_NAME
} from '$lib/server/auth/session';
import {
	checkLoginRateLimit,
	recordLoginFailure,
	clearLoginFailures
} from '$lib/server/auth/rate-limit';
import { loginSchema } from '$lib/shared/schemas';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(303, '/dashboard');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const rawData = Object.fromEntries(formData.entries());

		const parseResult = loginSchema.safeParse(rawData);
		if (!parseResult.success) {
			return fail(400, {
				error: 'Bitte gib eine gültige E-Mail-Adresse und dein Passwort ein.',
				values: { email: String(rawData.email || '') }
			});
		}

		const { email, password } = parseResult.data;

		// Brute-force protection: per account, not per IP (guests share one NAT IP).
		const rateLimit = checkLoginRateLimit(email);
		if (rateLimit.blocked) {
			return fail(429, {
				error: `Zu viele fehlgeschlagene Versuche. Bitte in ${Math.ceil(
					rateLimit.retryAfterSeconds / 60
				)} Minuten erneut versuchen.`,
				values: { email }
			});
		}

		// Look up user
		const userRecord = findUserByEmail(email);
		if (!userRecord || !userRecord.user.isActive) {
			// Anti-enumeration: verify against the dummy hash so an unknown address
			// costs the same Argon2id work as a wrong password on a real account.
			await verifyPassword(DUMMY_ARGON2_HASH, password);
			recordLoginFailure(email);
			return fail(400, {
				error: 'Ungültige E-Mail-Adresse oder falsches Passwort.',
				values: { email }
			});
		}

		// Verify password
		const isPasswordValid = await verifyPassword(userRecord.passwordHash, password);
		if (!isPasswordValid) {
			recordLoginFailure(email);
			return fail(400, {
				error: 'Ungültige E-Mail-Adresse oder falsches Passwort.',
				values: { email }
			});
		}

		// Successful login clears the failure counter
		clearLoginFailures(email);

		// Rotate the session token: destroy the current one, then issue a new one.
		// Prevents session fixation and cuts the lifetime of a leaked cookie.
		const currentToken = cookies.get(SESSION_COOKIE_NAME);
		if (currentToken) {
			deleteSession(currentToken);
		}

		// Create session
		const { token, expiresAt } = createSession(userRecord.user.id);
		setSessionCookie(cookies, token, expiresAt);

		throw redirect(303, '/dashboard');
	}
};
