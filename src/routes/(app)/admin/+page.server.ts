import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { isFfmpegAvailable } from '$lib/server/media/processor.js';
import { mediaQueue } from '$lib/server/media/queue.js';
import { getDb } from '$lib/server/db/client.js';
import {
	countUsers,
	listUsers,
	findUserById,
	setUserActive,
	setUserRole,
	deleteUser
} from '$lib/server/db/repositories/user.repository.js';
import { SettingsRepository } from '$lib/server/db/repositories/settings.repository.js';
import { sendTestMail } from '$lib/server/mail/smtp.js';
import { config } from '$lib/server/config/env.js';

function getDirectorySize(dirPath: string): number {
	if (!fs.existsSync(dirPath)) return 0;
	let total = 0;
	const entries = fs.readdirSync(dirPath, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dirPath, entry.name);
		if (entry.isFile()) {
			total += fs.statSync(full).size;
		} else if (entry.isDirectory()) {
			total += getDirectorySize(full);
		}
	}
	return total;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Forbidden');
	}

	const db = getDb();
	const ffmpegAvailable = await isFfmpegAvailable();
	const queueLength = mediaQueue.getQueueLength();
	const queueBusy = mediaQueue.isBusy();

	const dbPath = config.databasePath;
	const dbSizeBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
	const blobsSizeBytes = getDirectorySize(config.blobsDir);

	const userCount = countUsers();
	const eventCount = (db.prepare('SELECT COUNT(*) as count FROM events').get() as any)?.count || 0;
	const guestCount = (db.prepare('SELECT COUNT(*) as count FROM guests').get() as any)?.count || 0;
	const mediaCount = (db.prepare('SELECT COUNT(*) as count FROM media').get() as any)?.count || 0;

	const rawSettings = SettingsRepository.getAllSettings();
	const settings = {
		...rawSettings,
		hasSmtpPass: !!rawSettings.smtpPass,
		smtpPass: '' // Never send password plaintext to client
	};

	const users = listUsers();
	const currentAdmin = findUserById(locals.user.id);
	const adminEmail = currentAdmin?.email || '';

	return {
		system: {
			ffmpegAvailable,
			queueLength,
			queueBusy,
			dbSizeBytes,
			blobsSizeBytes,
			counts: {
				users: userCount,
				events: eventCount,
				guests: guestCount,
				media: mediaCount
			}
		},
		settings,
		users,
		adminEmail
	};
};

export const actions: Actions = {
	saveSettings: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Forbidden');

		const formData = await request.formData();
		const registrationEnabled = formData.get('registrationEnabled') === 'on';
		const maxUploadSizeMb = parseInt(String(formData.get('maxUploadSizeMb') || '500'), 10);
		const quotaPerEventMb = parseInt(String(formData.get('quotaPerEventMb') || '5000'), 10);
		const smtpHost = String(formData.get('smtpHost') || '').trim();
		const smtpPort = parseInt(String(formData.get('smtpPort') || '587'), 10);
		const smtpSecure = formData.get('smtpSecure') === 'on';
		const smtpUser = String(formData.get('smtpUser') || '').trim();
		const smtpPass = String(formData.get('smtpPass') || '');
		const smtpFrom = String(formData.get('smtpFrom') || '').trim();

		const updatePayload: any = {
			registrationEnabled,
			maxUploadSizeMb: isNaN(maxUploadSizeMb) ? 500 : maxUploadSizeMb,
			quotaPerEventMb: isNaN(quotaPerEventMb) ? 5000 : quotaPerEventMb,
			smtpHost,
			smtpPort: isNaN(smtpPort) ? 587 : smtpPort,
			smtpSecure,
			smtpUser,
			smtpFrom
		};

		// Only update smtpPass if host provided a new non-empty password
		if (smtpPass) {
			updatePayload.smtpPass = smtpPass;
		}

		SettingsRepository.updateSettings(updatePayload);
		return { success: true, settingsSaved: true };
	},

	sendTestEmail: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Forbidden');

		const admin = findUserById(locals.user.id);
		const formData = await request.formData();
		const targetEmail = String(formData.get('targetEmail') || admin?.email || '').trim();

		const result = await sendTestMail(targetEmail);
		if (!result.success) {
			return fail(400, {
				testMailError: result.error || 'Fehler beim Senden der Test-E-Mail.'
			});
		}

		return {
			testMailSuccess: true,
			sentTo: targetEmail
		};
	},

	toggleUserActive: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Forbidden');

		const formData = await request.formData();
		const userId = String(formData.get('userId') || '');
		const isActive = formData.get('isActive') === 'true';

		if (userId === locals.user.id) {
			return fail(400, { error: 'Du kannst deinen eigenen Administrator-Account nicht sperren.' });
		}

		setUserActive(userId, isActive);
		return { success: true };
	},

	toggleUserRole: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Forbidden');

		const formData = await request.formData();
		const userId = String(formData.get('userId') || '');
		const newRole = formData.get('role') === 'admin' ? 'admin' : 'host';

		if (userId === locals.user.id && newRole !== 'admin') {
			return fail(400, { error: 'Du kannst dir selbst nicht die Administratorrechte entziehen.' });
		}

		setUserRole(userId, newRole);
		return { success: true };
	},

	deleteUser: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Forbidden');

		const formData = await request.formData();
		const userId = String(formData.get('userId') || '');

		if (userId === locals.user.id) {
			return fail(400, { error: 'Du kannst deinen eigenen Account hier nicht löschen.' });
		}

		deleteUser(userId);
		return { success: true, userDeleted: true };
	}
};
