# Sicherheitsarchitektur & Krypto-Design

## 1. Schlüsselhierarchie (Envelope Encryption)

Die Anwendung implementiert Envelope Encryption mit OpenSSL/Node.js `crypto`:

1. **Master-Schlüsselpaar (RSA-4096):**
   - Beim ersten Systemstart generiert.
   - Public Key (`/config/keys/master_pub.pem`): Verschlüsselt neue Event-Schlüssel.
   - Private Key (`/config/keys/master_priv.pem.enc`): Geschützt mit AES-256-GCM. Der Passphrase-Schlüssel wird per Argon2id (64 MiB RAM, 3 Iterationen) abgeleitet.
2. **Event-Schlüssel (EK - 256-Bit):**
   - Zufälliger 256-Bit-Schlüssel pro Event.
   - Liegt im Keystore (`/config/keys/events/{event_id}.key`) mit RSA-OAEP (SHA-256) verpackt.
   - Wird im Arbeitsspeicher in einem LRU-Cache mit 15-Minuten-TTL gehalten.
3. **Datei-Schlüssel (FK - 256-Bit):**
   - Zufälliger 256-Bit-Schlüssel pro Mediendatei.
   - Gespeichert in der `media`-Tabelle, mit dem Event-Key per AES-256-GCM verpackt.

## 2. Medien-Verschlüsselung (Chunked AES-256-GCM)

- Chunks von jeweils exakt **1 MiB** (1.048.576 Bytes Klartext).
- Format pro Chunk: `[Nonce 12B][Ciphertext max 1 MiB][AuthTag 16B]`.
- Nonce: 8 Bytes dateispezifischer Salt + 4 Bytes Big-Endian Chunk-Index.
- AAD: `media:{file_id}:chunk:{chunk_index}:final:{0|1}`. Manipulationen der Reihenfolge oder Abschneiden von Dateien werden sofort erkannt.
- HTTP Range-Requests entschlüsseln deterministisch nur die angeforderten Chunks.

## 3. Textdaten-Verschlüsselung

Sensible Spalten (Titel, Beschreibung, Adressen, Gästenamen, Kommentare, Umfragetexte) werden mit dem EK per AES-256-GCM verschlüsselt gespeichert.

- AAD = `{table}:{row_id}:{column_name}` (verhindert Vertauschen von Feldern zwischen Zeilen/Tabellen).
- Unverschlüsselt bleiben nur Metadaten für Indizes und Status (`id`, `created_at`, `status`, `sort_order`).

## 4. Crypto-Shredding (Löschgarantie)

Beim Löschen eines Events wird der verpackte Event-Schlüssel `/config/keys/events/{event_id}.key` sofort unwiderruflich aus dem Dateisystem entfernt.

- **Garantie:** Selbst wenn Datenträger-Fragmente auf SSDs, ZFS/btrfs Copy-on-Write-Dateisystemen oder Snapshots verbleiben, sind alle Daten und Medien des Events mathematisch unlesbar.
- Zusätzlich werden alle SQLite-Einträge und Blobs physisch gelöscht, gefolgt von WAL-Checkpoint und `secure_delete = ON`.

## 5. Threat Model & Ehrliche Grenzen

- **Geschützt gegen:** Diebstahl von Server-Festplatten, Diebstahl unberechtigter Daten-Backups, Leaks verwaister Temp-Dateien.
- **NICHT geschützt gegen:** Einen kompromittierten laufenden Server mit Root-Rechten oder RAM-Dump zur Laufzeit. Wer Root-Zugriff hat, kann Schlüssel aus dem laufenden Node-Prozess extrahieren. Hierfür ist im Backlog ein optionaler E2E-Fragment-Modus vorgesehen.
