import path from 'node:path';

export interface AppConfig {
	dataDir: string;
	databasePath: string;
	configDir: string;
	blobsDir: string;
	keysDir: string;
	eventsKeyDir: string;
	passphrase?: string;
	baseUrl: string;
	origin: string;
	isProduction: boolean;
}

const databasePath = path.resolve(process.env.DATABASE_PATH || 'data/app.db');
const dataDir = path.resolve(process.env.DATA_DIR || path.dirname(databasePath));
const configDir = path.resolve(process.env.CONFIG_DIR || 'config');
const keysDir = path.resolve(process.env.MASTER_KEY_DIR || path.join(configDir, 'keys'));

export const config: AppConfig = {
	dataDir,
	databasePath,
	configDir,
	blobsDir: path.resolve(process.env.BLOB_STORAGE_PATH || path.join(dataDir, 'blobs')),
	keysDir,
	eventsKeyDir: path.resolve(process.env.EVENTS_KEY_DIR || path.join(keysDir, 'events')),
	passphrase: process.env.ENCRYPTION_PASSPHRASE || undefined,
	baseUrl: process.env.BASE_URL || 'http://localhost:3000',
	origin: process.env.ORIGIN || 'http://localhost:3000',
	isProduction: process.env.NODE_ENV === 'production'
};
