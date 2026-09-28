# Einladung 🎈

> **Selbst gehostete, kompromisslos private Einladungs-App (PWA) für Partys und Geburtstage.**

Einladung ist eine moderne Web-App, mit der Hosts stilvolle Einladungen erstellen und verwalten. Gäste öffnen einfach einen geheimen Link im Browser – **ohne Registrierung oder App-Installation** –, sehen alle Details, sagen zu oder ab, stimmen in Umfragen ab, schreiben auf die Pinnwand und laden Fotos & Videos in Originalqualität hoch.

---

## Highlights

- 🔒 **100 % Privatsphäre:** Keine externen CDNs, keine Google Fonts, keine Tracker, keine externen Tiles. Alles wird lokal aus einem einzigen Container ausgeliefert.
- 🛡️ **Envelope Encryption & Crypto-Shredding:**
  - RSA-4096 Master-Schlüssel + 256-Bit Event-Schlüssel.
  - Chunked AES-256-GCM Streaming-Verschlüsselung (1 MiB Chunks) für alle Medien.
  - Sensible Datenbankspalten mit AAD verschlüsselt.
  - Beim Löschen eines Events wird der Event-Schlüssel sofort physisch vernichtet – alle Daten werden mathematisch unlesbar.
- ⚡ **Echtzeit mit SSE:** Pinnwand-Einträge, Umfrageergebnisse und neue Medien erscheinen sofort live ohne Seiten-Reload.
- 📸 **Verschlüsselte Medien-Pipeline:**
  - Resumable Uploads via **tus 1.0.0 Protokoll**.
  - `sharp` für automatisches EXIF/GPS-Stripping, WebP-Generierung und Blurhash-Vorschauen.
  - `ffmpeg` für H.264/AAC Web-Transcoding mit Faststart.
  - HTTP Range-Requests mit dynamischer Entschlüsselung für schnelles Video-Seeking.
- 📱 **Apple-inspiriertes Design:**
  - Ruhiger Look (SF Pro/Inter, 8-pt Raster, nativ wirkende Sheets und Dialoge).
  - Gestengesteuerte Lightbox mit Swipe & Pinch-to-Zoom.
  - PWA: Cacht ausschließlich die App-Shell (niemals unverschlüsselte Daten).
  - Automatische WCAG AA Kontrastberechnung für Host-Farben.
- ⚙️ **Admin-Dashboard:**
  - Benutzerverwaltung (Sperren, Rollen, Löschen).
  - Quotas & Speicherlimits.
  - Verschlüsselte SMTP-Konfiguration mit Live-Testmail-Funktion.

---

## Schnellstart mit Docker (Empfohlen)

Das gesamte Projekt läuft in einem einzigen Container ohne externe Datenbanken oder Hilfsdienste.

### 1. `docker-compose.yml` starten

Das fertige Image wird automatisch von der GitHub Container Registry bezogen:

```bash
docker compose up -d
```

Öffne anschließend `http://localhost:3000` im Browser. Der erste registrierte Benutzer erhält automatisch die Rolle **Administrator**.

Für eine öffentliche Installation kopiere `.env.example` nach `.env`, setze `BASE_URL` auf die öffentliche HTTPS-URL und hinterlege ein langes zufälliges `ENCRYPTION_PASSPHRASE`. Die Passphrase darf nach dem ersten Start nicht verloren gehen, da sie für die Entschlüsselung des Master-Schlüssels benötigt wird.

### Verzeichnisstruktur der Volumes:

- `/data`: SQLite-Datenbank (`app.db`) und verschlüsselte Medien-Blobs (`blobs/`).
- `/config`: RSA-Master-Schlüsselpaar und verpackte Event-Schlüssel (`keys/`).

> **Wichtig für Backups:** Sichern Sie `/data` und `/config` getrennt (siehe `docs/BACKUP.md`). Ohne `/config` können die Daten in `/data` nicht entschlüsselt werden.

---

## Lokale Entwicklung

### Voraussetzungen

- Node.js 22 LTS
- pnpm 10+
- `ffmpeg` (optional für Video-Transcoding)

### Installation & Start

```bash
# Abhängigkeiten installieren
pnpm install

# Entwicklungsserver starten
pnpm dev
```

### Qualitätsprüfung & Tests

```bash
# TypeScript Typecheck
pnpm check

# Unit-Tests mit Vitest
pnpm test:unit

# Vollständiger CI-Lauf (Docs, i18n, Boundaries, No-External, Check, Unit Tests)
pnpm test:ci

# Produktions-Build erstellen
pnpm build
```

---

## Konfiguration

Der Name der App ist an genau einer Stelle definiert:

- [`src/lib/config.ts`](file:///src/lib/config.ts) (`APP_NAME = 'Einladung'`).

Umgebungsvariablen:

| Variable            | Standardwert            | Beschreibung                                                                                                                                      |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`              | `3000`                  | Port des Webservers                                                                                                                               |
| `BASE_URL`          | `http://localhost:3000` | Externe URL für Einladungslinks                                                                                                                   |
| `ORIGIN`            | Wert von `BASE_URL`     | Browser-seitige Basis-URL für die Same-Origin-/CSRF-Prüfung. Wird beim Containerstart aus `BASE_URL` gesetzt, sofern nicht explizit konfiguriert. |
| `BODY_SIZE_LIMIT`   | `2M`                    | Maximale Größe eines einzelnen HTTP-Requests; muss größer als ein tus-Upload-Chunk sein.                                                          |
| `DATABASE_PATH`     | `data/app.db`           | Pfad zur SQLite-Datenbank                                                                                                                         |
| `BLOB_STORAGE_PATH` | `data/blobs`            | Pfad für verschlüsselte Medien                                                                                                                    |
| `MASTER_KEY_DIR`    | `config/keys`           | Pfad für RSA-Masterschlüssel                                                                                                                      |

---

## Dokumentation

Detaillierte Spezifikationen und Leitfäden:

- [`docs/ARCHITECTURE.md`](file:///docs/ARCHITECTURE.md) – Systemarchitektur & Datenfluss
- [`docs/SECURITY.md`](file:///docs/SECURITY.md) – Krypto-Design & Threat-Model
- [`docs/REVERSE_PROXY.md`](file:///docs/REVERSE_PROXY.md) – Reverse-Proxy Konfiguration (Caddy, Nginx, Traefik, Cloudflare)
- [`docs/DESIGN-SYSTEM.md`](file:///docs/DESIGN-SYSTEM.md) – Tokens, Gesten & Barrierefreiheit
- [`docs/BACKUP.md`](file:///docs/BACKUP.md) – 3-2-1 Backup-Strategie & Disaster Recovery
- [`docs/DECISIONS.md`](file:///docs/DECISIONS.md) – Architecture Decision Records (ADR)
- [`docs/features/`](file:///docs/features/) – Feature-Karten für alle Module

---

## Lizenz

MIT Lizenz. Frei für privaten und kommerziellen Gebrauch.
