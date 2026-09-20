import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../../../src/lib/server/db/migrate.js';
import { createUser, findUserByEmail, listUsers, setUserActive, setUserRole, deleteUser } from '../../../src/lib/server/db/repositories/user.repository.js';
import { hashPassword } from '../../../src/lib/server/auth/password.js';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery.js';
import { SettingsRepository, DEFAULT_SETTINGS } from '../../../src/lib/server/db/repositories/settings.repository.js';
import { sendTestMail } from '../../../src/lib/server/mail/smtp.js';

describe('Admin, Settings & User Management Modules', () => {
  let adminId = '';
  let testHostId = '';

  beforeAll(async () => {
    runMigrations();

    const pwdHash = await hashPassword('AdminPass123!');
    const codes = generateRecoveryCodes(10).map((c) => c.codeHash);

    const { user: adminUser } = createUser(`sysadmin-${Date.now()}@party.local`, pwdHash, codes);
    adminId = adminUser.id;

    const { user: hostUser } = createUser(`testhost-${Date.now()}@party.local`, pwdHash, codes);
    testHostId = hostUser.id;
  });

  it('loads default settings when table is empty', () => {
    const settings = SettingsRepository.getAllSettings();
    expect(settings.registrationEnabled).toBe(true);
    expect(settings.maxUploadSizeMb).toBe(500);
    expect(settings.quotaPerEventMb).toBe(5000);
    expect(settings.smtpPort).toBe(587);
  });

  it('persists and encrypts settings using the Master Key', () => {
    SettingsRepository.updateSettings({
      registrationEnabled: false,
      maxUploadSizeMb: 250,
      smtpHost: 'smtp.testmail.local',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: 'partyapp',
      smtpPass: 'SuperSecretSmtpPass!@#',
      smtpFrom: 'invitation@partyapp.local'
    });

    const retrieved = SettingsRepository.getAllSettings();
    expect(retrieved.registrationEnabled).toBe(false);
    expect(retrieved.maxUploadSizeMb).toBe(250);
    expect(retrieved.smtpHost).toBe('smtp.testmail.local');
    expect(retrieved.smtpPort).toBe(465);
    expect(retrieved.smtpSecure).toBe(true);
    expect(retrieved.smtpUser).toBe('partyapp');
    expect(retrieved.smtpPass).toBe('SuperSecretSmtpPass!@#');
    expect(retrieved.smtpFrom).toBe('invitation@partyapp.local');

    // Restore registrationEnabled for subsequent tests
    SettingsRepository.updateSettings({ registrationEnabled: true });
  });

  it('lists users and manages activation status', () => {
    const users = listUsers();
    expect(users.length).toBeGreaterThanOrEqual(2);

    const targetUser = users.find((u) => u.id === testHostId);
    expect(targetUser).toBeDefined();
    expect(targetUser?.isActive).toBe(true);

    // Lock user
    setUserActive(testHostId, false);
    const updatedUsers = listUsers();
    const lockedUser = updatedUsers.find((u) => u.id === testHostId);
    expect(lockedUser?.isActive).toBe(false);

    // Unlock user
    setUserActive(testHostId, true);
    const reloaded = listUsers().find((u) => u.id === testHostId);
    expect(reloaded?.isActive).toBe(true);
  });

  it('manages user roles and deletion', () => {
    // Promote to admin
    setUserRole(testHostId, 'admin');
    let u = listUsers().find((x) => x.id === testHostId);
    expect(u?.role).toBe('admin');

    // Demote to host
    setUserRole(testHostId, 'host');
    u = listUsers().find((x) => x.id === testHostId);
    expect(u?.role).toBe('host');

    // Delete user
    const deleted = deleteUser(testHostId);
    expect(deleted).toBe(true);
    expect(listUsers().some((x) => x.id === testHostId)).toBe(false);
  });

  it('fails gracefully when sending test email without valid host or server', async () => {
    SettingsRepository.updateSettings({ smtpHost: '' });
    const resNoHost = await sendTestMail('nobody@party.local');
    expect(resNoHost.success).toBe(false);
    expect(resNoHost.error).toContain('Kein SMTP-Host');

    // Set non-existent SMTP host
    SettingsRepository.updateSettings({
      smtpHost: '127.0.0.1',
      smtpPort: 65432
    });
    const resFail = await sendTestMail('nobody@party.local');
    expect(resFail.success).toBe(false);
  });
});
