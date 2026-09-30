import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations } from '../../../src/lib/server/db/migrate.js';
import { getDb } from '../../../src/lib/server/db/client.js';
import { SettingsRepository } from '../../../src/lib/server/db/repositories/settings.repository.js';

/**
 * Pins the operator-facing consequence of flipping DEFAULT_SETTINGS.registrationEnabled
 * to false, so the CHANGELOG upgrade note cannot silently go stale.
 */
describe('registrationEnabled default and persisted value', () => {
	beforeEach(() => {
		runMigrations();
		getDb().prepare('DELETE FROM system_settings').run();
	});

	it('falls back to the (now disabled) default when no row was ever saved', () => {
		// This is the upgrade case for an instance that never saved admin settings.
		expect(SettingsRepository.getAllSettings().registrationEnabled).toBe(false);
	});

	it('keeps an explicitly saved value instead of overwriting it with the default', () => {
		// An instance that already enabled registration must not be closed by the upgrade.
		SettingsRepository.updateSettings({ registrationEnabled: true });
		expect(SettingsRepository.getAllSettings().registrationEnabled).toBe(true);

		SettingsRepository.updateSettings({ registrationEnabled: false });
		expect(SettingsRepository.getAllSettings().registrationEnabled).toBe(false);
	});
});
