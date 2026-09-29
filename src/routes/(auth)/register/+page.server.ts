import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	countUsers,
	createUser,
	findUserByEmail
} from '$lib/server/db/repositories/user.repository';
import { SettingsRepository } from '$lib/server/db/repositories/settings.repository';
import { hashPassword, verifyPassword } from '$lib/server/auth/password';
import { generateRecoveryCodes } from '$lib/server/auth/recovery';
import { createPoWChallenge, verifyPoWSolution } from '$lib/server/auth/pow';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import { registerSchema } from '$lib/shared/schemas';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(303, '/dashboard');
	}

	const isFirstUser = countUsers() === 0;
	const settings = SettingsRepository.getAllSettings();
	const registrationEnabled = isFirstUser || settings.registrationEnabled;

	// Create PoW challenge with difficulty 3 for quick browser solve
	const pow = createPoWChallenge(3);

	return {
		isFirstUser,
		registrationEnabled,
		pow
	};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const rawData = Object.fromEntries(formData.entries());

		const parseResult = registerSchema.safeParse(rawData);
		if (!parseResult.success) {
			return fail(400, {
				error: 'Ungültige Eingaben. Das Passwort muss mindestens 8 Zeichen lang sein.',
				values: { email: String(rawData.email || '') }
			});
		}

		const { email, password, challenge, nonce, difficulty, expiresAt, signature } =
			parseResult.data;

		const isFirstUser = countUsers() === 0;
		const settings = SettingsRepository.getAllSettings();
		if (!isFirstUser && !settings.registrationEnabled) {
			return fail(403, {
				error: 'Die Registrierung neuer Benutzer ist derzeit durch den Administrator deaktiviert.',
				values: { email }
			});
		}

		// 1. Verify Proof-of-Work solution
		const isPoWValid = verifyPoWSolution(challenge, nonce, difficulty, expiresAt, signature);
		if (!isPoWValid) {
			return fail(400, {
				error:
					'Sicherheitsprüfung (Proof-of-Work) fehlgeschlagen oder abgelaufen. Bitte versuche es erneut.',
				values: { email }
			});
		}

		// 2. Check if email is already taken.
		// Anti-enumeration: always perform the (expensive) Argon2 hash, even when the
		// address is free, and answer with the same generic text in every failure
		// case. Previously the existence check short-circuited before hashing, which
		// leaked registered addresses both via the message and via a ~100x timing gap.
		const existing = findUserByEmail(email);

		const pwdHash = await hashPassword(password);
		if (!existing) {
			// Burn the same amount of work as the dummy path below for a taken address.
			await verifyPassword(
				'$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$P1d9P7J3uJvU1wFv3J0O9g',
				password
			);
		}

		if (existing) {
			return fail(400, {
				error: 'Registrierung nicht möglich. Bitte überprüfe deine Angaben.',
				values: { email }
			});
		}

		// 3. Generate 10 recovery codes
		const recoveryPairs = generateRecoveryCodes(10);
		const recoveryCodeHashes = recoveryPairs.map((p) => p.codeHash);

		// 4. Create user
		const { user } = createUser(email, pwdHash, recoveryCodeHashes);

		// 5. Establish session
		const { token, expiresAt: sessionExpiresAt } = createSession(user.id);
		setSessionCookie(cookies, token, sessionExpiresAt);

		// Return the recovery codes to display to the user once
		return {
			success: true,
			recoveryCodes: recoveryPairs.map((p) => p.code)
		};
	}
};
