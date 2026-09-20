import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './client';

export function runMigrations(): { applied: string[] } {
  const db = getDb();

  // Create migrations tracker table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT name FROM _migrations').all() as { name: string }[];
  const appliedSet = new Set(appliedRows.map((r) => r.name));

  const migrationsDir = path.resolve('src/lib/server/db/migrations');
  if (!fs.existsSync(migrationsDir)) {
    return { applied: [] };
  }

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const newlyApplied: string[] = [];

  for (const file of files) {
    if (!appliedSet.has(file)) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      const applyTx = db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
      });

      applyTx();
      newlyApplied.push(file);
      console.log(`Applied migration: ${file}`);
    }
  }

  return { applied: newlyApplied };
}