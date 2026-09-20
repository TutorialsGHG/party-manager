import path from 'node:path';

export interface AppConfig {
  dataDir: string;
  configDir: string;
  blobsDir: string;
  keysDir: string;
  eventsKeyDir: string;
  passphrase?: string;
  baseUrl: string;
  origin: string;
  isProduction: boolean;
}

const dataDir = path.resolve(process.env.DATA_DIR || 'data');
const configDir = path.resolve(process.env.CONFIG_DIR || 'config');

export const config: AppConfig = {
  dataDir,
  configDir,
  blobsDir: path.join(dataDir, 'blobs'),
  keysDir: path.join(configDir, 'keys'),
  eventsKeyDir: path.join(configDir, 'keys', 'events'),
  passphrase: process.env.ENCRYPTION_PASSPHRASE || undefined,
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  origin: process.env.ORIGIN || 'http://localhost:3000',
  isProduction: process.env.NODE_ENV === 'production'
};