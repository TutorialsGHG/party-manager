import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	countUsers,
	createUser,
	findUserByEmail
} from '$lib/server/db/repositories/user.repository';
import { SettingsRepository } from '$lib/server/db/repositories/settings.repository';
import { hashPassword, verifyPassword, DUMMY_ARGON2_HASH } from '$lib/server/auth/password';
import { generateRecoveryCodes } from '$lib/server/auth/recovery';
import { createPoWChallenge, verifyPoWSolution } from '$lib/server/auth/pow';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import { checkRegisterRateLimit, recordRegisterAttempt } from '$lib/server/auth/rate-limit';
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

		// 0. Throttle registration attempts.
		//
		// Prevents automated account creation. The proof-of-work below is not a
		// substitute: it runs in the browser of a legitimate user, but an attacker
		// solving it server-side costs a single SHA-256 loop and is nearly free to
		// script. The throttle is keyed per submitted account, so repeated typos on a
		// real address cannot lock a legitimate user out of their own registration.
		//
		// The first user is exempt: a fresh instance must stay installable even though
		// the counter would otherwise be shared by whoever reaches /register first.
		if (!isFirstUser) {
			const rateLimit = checkRegisterRateLimit(email);
			if (rateLimit.blocked) {
				return fail(429, {
					error: `Zu viele Registrierungsversuche. Bitte in ${Math.ceil(
						rateLimit.retryAfterSeconds / 60
					)} Minuten erneut versuchen.`,
					values: { email }
				});
			}
		}

		// 1. Verify Proof-of-Work solution
		const isPoWValid = verifyPoWSolution(challenge, nonce, difficulty, expiresAt, signature);
		if (!isPoWValid) {
			// A failed proof is the cheap path for an attacker, so it counts too -
			// otherwise the throttle would only ever trip on PoW that somehow passed.
			recordRegisterAttempt(email);
			return fail(400, {
				error:
					'Sicherheitsprüfung (Proof-of-Work) fehlgeschlagen oder abgelaufen. Bitte versuche es erneut.',
				values: { email }
			});
		}

		// 2. Check if email is already taken.
		// Anti-enumeration: both branches must cost the same and must return the
		// same generic text. Previously the existence check short-circuited before
		// hashing, which leaked registered addresses both via the message and via a
		// ~100x timing gap.
		const existing = findUserByEmail(email);

		if (existing) {
			// Burn one Argon2id operation so a taken address is indistinguishable
			// from a free one in wall-clock time. The hash itself is never used.
			await verifyPassword(DUMMY_ARGON2_HASH, password);
			return fail(400, {
				error: 'Registrierung nicht möglich. Bitte überprüfe deine Angaben.',
				values: { email }
			});
		}

		// 3. Hash password and generate 10 recovery codes
		const pwdHash = await hashPassword(password);
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
