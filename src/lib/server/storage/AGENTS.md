# Lokale Regeln: src/lib/server/storage

1. Nur Module in diesem Verzeichnis schreiben oder lesen Blob-Dateien auf dem Dateisystem.
2. Mediendateien werden ausschließlich in 1-MiB-AES-256-GCM Chunks gestreamt und verschlüsselt gespeichert.
3. Dateinamen auf der Festplatte sind zufällige UUIDs; Original-Dateinamen werden nur verschlüsselt in der Datenbank abgelegt.
4. Nach dem Löschen eines Mediums müssen alle zugehörigen Chunks und temporären Dateien bereinigt werden.