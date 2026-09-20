import { getDb } from '../client.js';
import { encryptWithMasterPublicKey, decryptWithMasterKey } from '../../crypto/master-key.js';

export interface SystemSettings {
  registrationEnabled: boolean;
  maxUploadSizeMb: number;
  quotaPerEventMb: number;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtpSecure: boolean;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  registrationEnabled: true,
  maxUploadSizeMb: 500,
  quotaPerEventMb: 5000,
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  smtpSecure: false
};

export class SettingsRepository {
  /**
   * Retrieves a single decrypted setting value.
   */
  static get(key: string): string | null {
    const db = getDb();
    const row = db.prepare('SELECT value_cipher FROM system_settings WHERE key = ?').get(key) as
      | { value_cipher: string }
      | undefined;

    if (!row) return null;

    try {
      const buf = decryptWithMasterKey(Buffer.from(row.value_cipher, 'base64'));
      return buf.toString('utf8');
    } catch {
      return null;
    }
  }

  /**
   * Sets and encrypts a setting value with Master Key.
   */
  static set(key: string, value: string): void {
    const db = getDb();
    const cipherBuf = encryptWithMasterPublicKey(Buffer.from(value, 'utf8'));
    const valueCipher = cipherBuf.toString('base64');
    const now = Date.now();

    db.prepare(
      `INSERT INTO system_settings (key, value_cipher, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_cipher = excluded.value_cipher, updated_at = excluded.updated_at`
    ).run(key, valueCipher, now);
  }

  /**
   * Retrieves all typed system settings with sensible defaults.
   */
  static getAllSettings(): SystemSettings {
    const reg = this.get('registration_enabled');
    const maxUpload = this.get('max_upload_size_mb');
    const quota = this.get('quota_per_event_mb');
    const host = this.get('smtp_host');
    const port = this.get('smtp_port');
    const user = this.get('smtp_user');
    const pass = this.get('smtp_pass');
    const from = this.get('smtp_from');
    const secure = this.get('smtp_secure');

    return {
      registrationEnabled: reg !== null ? reg === 'true' : DEFAULT_SETTINGS.registrationEnabled,
      maxUploadSizeMb: maxUpload ? parseInt(maxUpload, 10) : DEFAULT_SETTINGS.maxUploadSizeMb,
      quotaPerEventMb: quota ? parseInt(quota, 10) : DEFAULT_SETTINGS.quotaPerEventMb,
      smtpHost: host ?? DEFAULT_SETTINGS.smtpHost,
      smtpPort: port ? parseInt(port, 10) : DEFAULT_SETTINGS.smtpPort,
      smtpUser: user ?? DEFAULT_SETTINGS.smtpUser,
      smtpPass: pass ?? DEFAULT_SETTINGS.smtpPass,
      smtpFrom: from ?? DEFAULT_SETTINGS.smtpFrom,
      smtpSecure: secure !== null ? secure === 'true' : DEFAULT_SETTINGS.smtpSecure
    };
  }

  /**
   * Updates multiple system settings in a single transaction.
   */
  static updateSettings(settings: Partial<SystemSettings>): void {
    if (settings.registrationEnabled !== undefined) {
      this.set('registration_enabled', String(settings.registrationEnabled));
    }
    if (settings.maxUploadSizeMb !== undefined) {
      this.set('max_upload_size_mb', String(settings.maxUploadSizeMb));
    }
    if (settings.quotaPerEventMb !== undefined) {
      this.set('quota_per_event_mb', String(settings.quotaPerEventMb));
    }
    if (settings.smtpHost !== undefined) {
      this.set('smtp_host', settings.smtpHost);
    }
    if (settings.smtpPort !== undefined) {
      this.set('smtp_port', String(settings.smtpPort));
    }
    if (settings.smtpUser !== undefined) {
      this.set('smtp_user', settings.smtpUser);
    }
    if (settings.smtpPass !== undefined) {
      this.set('smtp_pass', settings.smtpPass);
    }
    if (settings.smtpFrom !== undefined) {
      this.set('smtp_from', settings.smtpFrom);
    }
    if (settings.smtpSecure !== undefined) {
      this.set('smtp_secure', String(settings.smtpSecure));
    }
  }
}
