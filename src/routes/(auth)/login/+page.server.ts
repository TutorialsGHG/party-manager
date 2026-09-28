import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { findUserByEmail } from '$lib/server/db/repositories/user.repository';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
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

		// Look up user
		const userRecord = findUserByEmail(email);
		if (!userRecord || !userRecord.user.isActive) {
			// Anti-enumeration: verify dummy password to prevent timing attacks
			await verifyPassword(
				'$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$P1d9P7J3uJvU1wFv3J0O9g',
				password
			);
			return fail(400, {
				error: 'Ungültige E-Mail-Adresse oder falsches Passwort.',
				values: { email }
			});
		}

		// Verify password
		const isPasswordValid = await verifyPassword(userRecord.passwordHash, password);
		if (!isPasswordValid) {
			return fail(400, {
				error: 'Ungültige E-Mail-Adresse oder falsches Passwort.',
				values: { email }
			});
		}

		// Create session
		const { token, expiresAt } = createSession(userRecord.user.id);
		setSessionCookie(cookies, token, expiresAt);

		throw redirect(303, '/dashboard');
	}
};
