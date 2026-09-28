import Database from 'better-sqlite3';
import fs from 'node:fs';
import { config } from '../config/env';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
	if (dbInstance) return dbInstance;

	if (!fs.existsSync(config.dataDir)) {
		fs.mkdirSync(config.dataDir, { recursive: true });
	}

	dbInstance = new Database(config.databasePath);

	// Performance & Security Pragmas as specified
	dbInstance.pragma('journal_mode = WAL');
	dbInstance.pragma('synchronous = NORMAL');
	dbInstance.pragma('foreign_keys = ON');
	dbInstance.pragma('secure_delete = ON');

	return dbInstance;
}

export function closeDb() {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
}
