import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		env: {
			ORIGIN: 'http://localhost:4173',
			// Isolated storage + passphrase so the e2e run never touches the local
			// dev database or a key that belongs to a different passphrase.
			ENCRYPTION_PASSPHRASE: 'e2e-passphrase-not-a-real-secret',
			DATA_DIR: '.e2e-data',
			DATABASE_PATH: '.e2e-data/app.db',
			BLOB_STORAGE_PATH: '.e2e-data/blobs',
			CONFIG_DIR: '.e2e-config',
			MASTER_KEY_DIR: '.e2e-config/keys',
			EVENTS_KEY_DIR: '.e2e-config/keys/events'
		}
	},
	testMatch: '**/*.e2e.{ts,js}'
});
