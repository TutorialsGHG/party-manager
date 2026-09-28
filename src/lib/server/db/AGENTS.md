# Lokale Regeln: src/lib/server/db

1. Nur Repositories in diesem Verzeichnis dürfen SQL-Queries ausführen.
2. Schema-Änderungen erfolgen **ausschließlich** über neue nummerierte Migrationsdateien in `migrations/`. Bestehende Migrationen dürfen niemals modifiziert werden.
3. Sensible Spalten müssen zwingend über die Krypto-Helfer verschlüsselt/entschlüsselt werden.
4. SQLite immer mit WAL-Modus (`journal_mode = WAL`) und `secure_delete = ON` betreiben.
