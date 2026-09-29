# Changelog

Alle relevanten Änderungen an diesem Projekt werden in dieser Datei nach den Prinzipien von [Keep a Changelog](https://keepachangelog.com/de/1.0.0/) dokumentiert.

## [Unreleased]

### Security

Behobene Befunde aus dem externen Sicherheitsaudit:

- **Umfragen-IDOR (HOCH):** `addPollOption` und `votePoll` prüfen jetzt, dass die
  Umfrage zum Event des Aufrufers gehört. Vorher konnte ein Gast eines fremden
  Events mit seiner eigenen Event-ID Umfragen anderer Events erweitern und
  abstimmen – die fremd eingefügte Option wurde mit dem Event-Key des Angreifers
  verschlüsselt und machte das Opfer-Event beim Laden dauerhaft unbenutzbar
  (HTTP 500). Zusätzlich werden Options-IDs gegen die zugehörige Umfrage geprüft.
- **TUS-Upload-Session (HOCH):** `PATCH`, `HEAD` und `DELETE` auf `/api/upload/[id]`
  prüfen jetzt dieselbe Autorisierung wie `POST /api/upload` (Host-Session oder
  Gast-Device-Token mit Besitzvergleich). Vorher konnte jeder, der die
  Session-UUID kannte, fremde Uploads überschreiben oder abbrechen.
- **Login-Rate-Limiting (HOCH):** 5 Fehlversuche pro Konto in 15 Minuten führen zu
  HTTP 429. Das Limit gilt bewusst pro Konto und nicht pro IP, da bei einem
  Schulfest alle Gäste dieselbe öffentliche IP teilen.
- **Verschlüsselter Master-Key (HOCH):** Beim ersten Start ohne
  `ENCRYPTION_PASSPHRASE` verweigert die App das Speichern des privaten
  RSA-4096-Schlüssels im Klartext (Override: `ALLOW_UNENCRYPTED_MASTER_KEY=true`).
  Bestehende Installationen mit vorhandenem Schlüssel sind nicht betroffen; der
  Entrypoint warnt zusätzlich beim Start.
- **Dokumentation (MITTEL):** `docs/features/auth.md`, `docs/features/admin.md` und
  `docs/ARCHITECTURE.md` beschreiben jetzt den Ist-Stand. Zuvor versprachen sie
  nicht vorhandene Features (IP-basiertes Rate-Limiting, CSP-Nonce, HSTS,
  Anti-Enumeration in der Registrierung).
- **SSE-Live-Feed (MITTEL):** `/api/events/[id]/sse` erfordert jetzt eine
  Host-Session oder einen gültigen Gast-Token; der Hub begrenzt Verbindungen
  (200 pro Event, 500 global) und lehnt Überlauf mit 503 ab.
- **Speicher-Kontingent (MITTEL):** `quotaPerEventMb` wird beim Upload nun tatsächlich
  geprüft (Summe der hochgeladenen Bytes je Event) statt nur im Admin-Formular
  angezeigt zu werden.
- **Proof-of-Work (MITTEL/NIEDRIG):** Lösungen sind jetzt Single-Use, eine
  nicht-hex-signierte oder manipulierte Signatur führt zu `false` statt zu einem
  HTTP 500, und `POW_SECRET` ist über die Umgebung stabilisierbar.
- **Sessions (MITTEL/NIEDRIG):** Idle-Timeout von 7 Tagen, Token-Rotation beim
  Login, und die `secure`-Flag des Session-Cookies wird aus der Basis-URL statt
  aus `NODE_ENV` abgeleitet.
- **Session-Cookie (HOCH, im Review gefunden):** Cookie-Name und `secure`-Flag
  werden jetzt aus derselben Quelle abgeleitet. Vorherhing der Name von
  `NODE_ENV`, das Flag von der Basis-URL: ein Bare-Metal-Deployment mit
  `NODE_ENV=production` und HTTP-`BASE_URL` setzte einen `__Host-session`-Cookie
  **ohne** das vorgeschriebene `Secure`-Flag, den ein Browser verwirft – jeder
  Login schlug still fehl. Der `__Host-`-Prefix wird nur noch bei HTTPS verwendet.
- **Speicher-Kontingent (MITTEL, im Review nachgeschärft):** verwaister
  Upload-Sessions zählen nicht mehr gegen `quotaPerEventMb`; gezählt werden
  abgeschlossene Medien plus laufende Uploads. Sessions, die nie zu Ende
  übertragen werden, räumt ein TTL-Cleanup (24 h) beim Start und täglich ab.
  Andernfalls konnte ein Gast das gesamte Kontingent durch bloßes Eröffnen von
  Upload-Sessions blockieren.
- **Registrierung (NIEDRIG):** generische Fehlermeldung und Dummy-Argon2-Hash
  beseitigen das User-Enumeration-Orakel (Meldung + Timing). Der Timing-Ausgleich
  wurde im Review explizit gemacht: beide Zweige kosten genau eine Argon2id-Operation,
  und der Dummy-Hash liegt als `DUMMY_ARGON2_HASH` neben den echten Parametern, damit
  ein Parameterwechsel den Schutz nicht unbemerkt auflöst.
- **Logout (NIEDRIG):** Die GET-Variante invalidiert die Session nicht mehr;
  Logout erfolgt ausschließlich per POST (das UI-Formular war bereits POST).
- **Caching & Header (NIEDRIG):** `Cache-Control: private, no-store` und
  `Vary: Cookie` auf HTML-Antworten, HSTS nur bei HTTPS-Basis-URL.
- **Startverhalten:** Fehlgeschlagene Krypto-/DB-Initialisierung beendet den
  Server jetzt, statt halb initialisiert weiterzulaufen.
- **Autorisierung:** `(app)`-Actions nutzen ein gemeinsames `requireUser()` und
  liefern bei fehlender Session 401 statt 500; `tokenHash` verlässt den Server
  nicht mehr; `findUserByEmail` fällt bei Entschlüsselungsfehlern nicht mehr auf
  die Aufrufereingabe zurück.

### Fixed

- Die Verify-Skripte unter `scripts/` (`verify-master-key-guard.sh`, `verify-live-fixes.sh`, `verify-poll-idor.py`) leiten das Repository aus ihrem eigenen Pfad ab und töten nur noch Server-Prozesse, die zum geprüften Build **und** zum geprüften Port gehören. Vorher killte `pgrep -f 'node .*build/index\.js'` jeden passenden Node-Prozess, und die absoluten Pfade liefen außerhalb des Entwicklerrechners nicht.
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
