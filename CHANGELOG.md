# Changelog

Alle relevanten Änderungen an diesem Projekt werden in dieser Datei nach den Prinzipien von [Keep a Changelog](https://keepachangelog.com/de/1.0.0/) dokumentiert.

## [Unreleased]

### Fixed

- CSRF-/Same-Origin-Konfiguration wird beim Containerstart aus der öffentlichen Basis-URL abgeleitet; schreibende Formulare funktionieren damit nach einem Deployment auch hinter einer konfigurierten öffentlichen URL.
- Tus-Uploads bleiben unter dem Request-Limit und verwenden die persistierenden Docker-Volumes für Datenbank, Blobs, temporäre Mediendateien und Schlüssel.
- Die RSVP-Zusagen zeigen überall die tatsächliche Gästezahl einschließlich Begleitpersonen; der Begleitpersonen-Zähler ist ausschließlich über Plus/Minus bedienbar.
- Poll- und Medienänderungen aktualisieren geöffnete Einladungen und die Host-Ansicht ohne vollständigen Seiten-Reload.

### Added

- **Healthcheck-Endpunkt:** Neuer, ressourcenschonender Endpunkt `/api/health` für Docker-Compose, Kubernetes und Uptime-Monitoring.
- **Galerie-Massen-Download (ZIP):** Hosts können alle geteilten Medien eines Events mit einem Klick als unkomprimiertes `.zip`-Archiv ohne externe Abhängigkeiten herunterladen.
- **Reverse-Proxy Dokumentation:** Detaillierte Anleitung für Caddy, Nginx (mit SSE `proxy_buffering off;`), Traefik und Cloudflare Tunnel in `docs/REVERSE_PROXY.md`.
- **Open-Source & GitHub-Vorbereitung:** MIT-Lizenz, GitHub Actions CI/CD Pipeline (`.github/workflows/ci.yml`), Issue- und Pull-Request-Templates sowie Sicherheitsrichtlinie (`SECURITY.md`).
- **Begleitpersonen-System:** Der Host kann reservierte Begleitplätze pro Einladung festlegen. Zusagende Hauptgäste erhalten persönliche Begleitlinks; Begleitpersonen können Namen hinterlegen, jedoch keinen eigenen RSVP-Status abgeben.
- Host-Ansicht für Pinnwand-Beiträge (veröffentlichen, anpinnen und löschen) sowie für Umfragen (anlegen, Optionen konfigurieren, öffnen/schließen).

## [1.0.0] - 2026-09-20

### Added

- **Architektur & Fundament:**
  - SvelteKit mit Svelte 5 Runes und `@sveltejs/adapter-node`.
  - SQLite mit `better-sqlite3` im WAL-Modus und `secure_delete=ON`.
  - 100 % privatsphärefreundlich: Keine externen CDNs, Fonts, Tiles, Analytics oder Tracker.
- **Kryptografie & Sicherheit:**
  - RSA-4096 Master-Schlüsselpaar mit Argon2id Passphrase-Schutz.
  - 256-Bit Event-Schlüssel mit RSA-OAEP Wrapping und 15-Minuten LRU In-Memory-Cache.
  - Chunked AES-256-GCM Streaming-Verschlüsselung (1 MiB Chunks) mit deterministischem AAD und Range-Requests.
  - Crypto-Shredding: Sofortiges unwiderrufliches Löschen von Schlüsseln auf Dateiebene.
  - Argon2id Password-Hashing, Proof-of-Work Challenge gegen automatisierte Registrierungen, 10 Einweg-Wiederherstellungscodes.
  - Passkeys (WebAuthn) und TOTP 2FA mit lokal generierten SVG-QR-Codes.
- **Events & Einladungen:**
  - Host Event-Dashboard mit Status, Farb-Theming und automatischer WCAG AA Kontrast-Ableitung.
  - Geheime Einladungs-Links (128-Bit Entropie) mit Token-Rotation.
  - Gast-Ansicht mit gerätegebundenem Cookie-Token (kein Login für Gäste erforderlich).
  - Zu-/Absagen (RSVP) mit Begleitpersonen-Zähler, Notizen und Live-Zusammenfassung.
  - `.ics` Kalenderexport mit Erinnerungen und konfigurierbaren Alarmen.
  - SVG-QR-Codes und datenschutzfreundliche Karten-Deeplinks (Apple Maps, OSM, Google Maps).
- **Echtzeit & Interaktion:**
  - Server-Sent Events (SSE) mit Multi-Room Broadcaster und Keepalive-Heartbeat.
  - Pinnwand mit Live-Beiträgen, Anpinn-Funktion und Gast-Löschberechtigungen.
  - Umfragen & Abstimmungen (Single/Multiple Choice, eigene Gast-Optionen, Live-Ergebnisbalken).
- **Verschlüsselte Medien-Pipeline & Galerie:**
  - Tus 1.0.0 resumable Upload-Protokoll mit direkter Chunk-Verschlüsselung.
  - Magic-Byte-Erkennung (JPEG, PNG, WebP, HEIC/HEIF, MP4, MOV, WebM).
  - Background-Processing: `sharp` für EXIF-Entfernung, WebP-Thumbnails und Blurhash; `ffmpeg` für H.264/AAC Web-Transcoding mit Faststart.
  - Range-Request Decryption für ruckelfreies Video-Streaming und Seeking.
  - Apple-Style Foto- & Video-Grid mit Blurhash-Platzhaltern und Vollbild-Lightbox mit Touch-Gesten (Swipe, Pinch-Zoom).
- **Admin-Bereich & Systemverwaltung:**
  - Geschützter Admin-Bereich (`role = 'admin'`).
  - Speicher-Limits, Upload-Größen und Quotas pro Event.
  - Registrierungs-Schalter (an/aus) und Benutzerverwaltung (Sperren, Rollen, Löschen).
  - SMTP-Konfiguration mit verschlüsselter DB-Ablage und Live-Testmail-Funktion.
  - System-Health-Dashboard (ffmpeg-Status, Queue-Länge, Storage-Nutzung).
- **Deployment & Tests:**
  - Multi-Arch Dockerfile (Node 22, ffmpeg, openssl) und `docker-compose.yml` mit getrennten Volumes (`/data` und `/config`).
  - Umfassende Vitest Unit-Testsuite (42 Tests in 10 Testdateien) und Playwright E2E Tests.
