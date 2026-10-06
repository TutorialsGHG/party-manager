# Changelog

Alle relevanten Änderungen an diesem Projekt werden in dieser Datei nach den Prinzipien von [Keep a Changelog](https://keepachangelog.com/de/1.0.0/) dokumentiert.

## [Unreleased]

### Fixed

- **Angepinnte Pinnwand-Beiträge erschienen bei Gästen erst nach einem Reload:**
  Der Host sendet beim Anpinnen `wall:update`, aber der Gast-Client abonnierte nur
  `wall:new` und `wall:delete`. Da die Oberfläche in beiden Fällen korrekt rendert,
  fiel die Lücke nicht auf — der Gast sah den alten Zustand einfach weiter, bis er
  geladen. Der Gast lauscht jetzt auch auf `wall:update` und sortiert
  lokal neu, exakt in der Reihenfolge von `listWallPosts()`.
  Drei Nachbesserungen aus der unabhängigen Prüfung:
  - Der Wächter-Test scanne ursprünglich nur **eine** Datei, obwohl Broadcasts über
    fünf Dateien verteilt sind. Eine eingeschleuste `wall:archive`-Broadcast in einer
    zweiten Datei blieb unentdeckt. Er läuft jetzt über den gesamten `src`-Baum.
  - `wall:update` trug nur die `postId`, der Client schaltete lokal um. Nach einem
    verlorenen Ereignis konnte der Zustand dauerhaft invertiert bleiben. Der Payload
    enthält jetzt den absoluten `isPinned`-Zustand, wodurch verpasste und doppelt
    zugestellte Ereignisse konvergieren statt zu driften.
  - Die Dokumentation behauptete eine CI-Garantie, die der Test nicht lieferte; sie
    benennt jetzt die tatsächliche Reichweite und die verbleibende Lücke.

### Security

- **Offene Registrierung als Default:** `registrationEnabled` war `true`. Damit
  akzeptierte jede erreichbare Instanz automatisierte Account-Erstellung: der
  einzige Widerstand auf `/register` ist ein Proof-of-Work, das ein Angreifer
  serverseitig für eine SHA-256-Schleife löst. Der Default ist jetzt `false` — der
  erste Benutzer kann weiterhin immer registrieren, alle weiteren erfordern eine
  bewusste Entscheidung in `/admin`.
- **Rate-Limit für `/register`:** 5 Versuche pro Konto und Stunde, in einem vom
  Login-Zähler getrennten Key-Space. Der erste Benutzer ist ausgenommen, damit eine
  frische Instanz installierbar bleibt.
- **Rate-Limit für die öffentlichen Gast-Pfade:** RSVP, Pinnwand-Beiträge,
  Umfragestimmen und Poll-Optionen waren komplett ungedrosselt — ein `curl`-Loop
  konnte die Pinnwand jedes bekannten Events füllen. 20 Aktionen pro Device und
  10 Minuten, gekeyt auf den Device-Token (nicht auf die IP, weil alle Gäste einer
  Schule hinter derselben Adresse sitzen). Migration `006_guest_rate_limit.sql`.
  Ein fehlender Device-Token gilt als gesperrt, nicht als unbeschränkt.

Review-Follow-up zu den beiden obigen Punkten:

- **Upload- und Schreibbudget fraßen sich gegenseitig (HOCH, im Review gefunden):**
  `guest_attempts` hatte keine Budget-Spalte, wodurch beide Zähler dieselben Zeilen
  zählten. Nachgewiesen mit den exakten Zahlen: 10 legale Uploads ließen nur noch
  10 von 20 Pinnwand-Beiträgen übrig, und 20 Pinnwand-Beiträge blockierten Uploads,
  obwohl das Upload-Budget unberührt war. Jetzt trägt jede Zeile ihr Budget, gewählt
  über den Namen (`'write'` / `'upload'`) statt über eine nackte Limit-Zahl — eine
  Zahl kann die Zähler nicht unterscheiden, genau das war die Ursache. Der
  Aufrufer in `api/upload` zeichnete außerdem gegen das Default-Write-Budget auf,
  während er das Upload-Budget prüfte. Migration
  `007_guest_attempt_budget.sql` ergänzt die Spalte additiv; bestehende Zeilen werden
  `'write'` zugeordnet, damit kein Upgrade mitten im Fenster ein neues Budget
  verschenkt.
- **Das Register-Fenster zählte erfolgreiche Registrierungen nicht (HOCH, im Review
  gefunden):** der einzige `recordRegisterAttempt()`-Aufruf lag im Zweig für eine
  **fehlgeschlagene** Proof-of-Work-Prüfung. Wer die Challenge korrekt löst — was
  laut obigem Kommentar genau eine SHA-256-Schleife kostet — trieb den Zähler also
  nie hoch und legte trotzdem ein Konto pro Adresse an. Der Aufruf zählt jetzt, direkt
  nachdem die PoW-Schranke passiert ist und bevor das Ergebnis feststeht, sodass auch
  Erfolg und „Adresse bereits vergeben" gezählt werden.
- **Adressen-Rotation war unbegrenzt (HOCH, im Review gefunden):** das Limit pro
  Konto begrenzt nur eine Adresse; wer Wegwerf-Adressen rotiert, löst es nie aus.
  Neu ist eine bewusst **großzügige** Netz-Deckelung (50 Versuche pro Netz und
  Stunde), die genau diesen Fall fängt. Sie liegt weit über jedem plausiblen
  echten Burst, damit sich eine ganze Schule hinter einem NAT nicht aussperrt. Ohne
  konfigurierte `ADDRESS_HEADER` liefert SvelteKit keine Adresse — dann greift
  weiterhin das Limit pro Konto. Bewusst **kein** Fallback auf `X-Forwarded-For`:
  ohne Trusted-Proxy-Liste könnte der Client den Header selbst setzen und sein
  eigenes Limit zurücksetzen.
- **Das Register-Fenster war wirkungslos (Korrektur):** `pruneOldAttempts()` teilte
  sich zwischen Login- und Registrierungszähler, benutzte aber fest
  `LOGIN_WINDOW_MS` (15 min). Der Prune löschte damit genau die Zeilen, die das
  1-Stunden-Fenster noch zählen sollte — real griff das Limit also alle 15 Minuten
  statt alle 60. Dasselbe galt für den opportunistischen globalen Sweep, der über
  beide Namespaces löschte. Jetzt nimmt `pruneOldAttempts` das Fenster als Parameter,
  und der globale Sweep boundet sich am größten Fenster der Tabelle (`MAX_WINDOW_MS`).
  Derselbe Fehlertyp stand auch im Gast-Modul: `pruneOldAttempts` benutzte fest
  `GUEST_WRITE_WINDOW_MS`, während die Prüfung ein Fenster als Parameter annahm.
  Heute folgen beide Guest-Budgets 10 Minuten, deshalb war es noch nicht sichtbar —
  mit benannten Budgets kann es aber strukturell nicht mehr auftreten.
- **Drei Gast-Pfade waren ungedrosselt (Korrektur):** die Beschreibung nannte RSVP,
  Pinnwand-Löschen, Begleitlink-Erstellung und Upload-Sitzungen, im Code geschützt
  waren nur Pinnwand, Umfragestimmen und Poll-Optionen. `GUEST_UPLOAD_MAX` war toter
  Code. Alle Actions sind jetzt gedrosselt; die Upload-Sitzung nutzt das engere
  Upload-Budget (10 statt 20).
- **Tests auf Route-Ebene:** die bisherigen Tests prüften nur den Helper. Genau deshalb
  blieb die Lücke unentdeckt — der Helper war korrekt, die Aufrufer fehlten. Neu ist
  `tests/unit/auth/guest-route-throttle.test.ts`, das jede mutierende Action einzeln
  prüft, inklusive eines Catch-all-Tests, der eine neu hinzugefügte Action ohne
  Drosselung sofort sichtbar macht.

> **⚠️ Hinweis für Betreiber (Upgrade):** Der Default von `registrationEnabled` ist
> jetzt `false`. Das kann **auch bestehende Installationen** treffen: der Wert wird
> nur dann aus der Datenbank gelesen, wenn `registration_enabled` dort tatsächlich
> steht, und der Default greift genau dann, wenn die Zeile fehlt. Eine Instanz, die
> die Admin-Einstellungen **noch nie gespeichert** hat, hat keine solche Zeile und
> ist nach dem Update bis zu einem expliziten Aktivieren in `/admin` geschlossen.
> Wer die Einstellungen bereits gespeichert hat, behält den dort gespeicherten Wert.
> Der erste Benutzer bleibt immer registrierbar, eine frische Instanz ist damit
> unverändert installierbar.

- **Gast- und Begleit-Cookies ohne `secure`-Flag:** Die Device-Token-Cookies
  (`dev_tok_*`, `comp_inv_*`), über die ein Gast seinen Upload-, SSE- und
  Löschezugriff authorisiert, wurden ohne `secure`-Flag gesetzt und bei einer
  fehlkonfigurierten TLS-Terminierung im Klartext übertragen. Sie verwenden jetzt
  dieselbe transportabhängige Quelle wie die Host-Session
  (`GUEST_COOKIE_OPTIONS` in `session.ts`), statt die Attribute an drei Stellen zu
  wiederholen.

### Changed

- **`pnpm lint` läuft jetzt in der CI:** `test:ci` enthielt nur `check` und nicht
  `lint`, wodurch Formatierungs- und ESLint-Verstöße unbemerkt auf `main` landen
  konnten. ESLint meldet aktuell 0 Fehler (59 Warnungen).

### Fixed

- **`POW_SECRET` ist jetzt dokumentiert:** Der HMAC-Schlüssel für die
  Registrierungs-Proof-of-Work-Challenges war weder in `.env.example` noch in
  `docker-compose.yml` gesetzt. Ohne explizite Konfiguration erzeugt der Server
  bei jedem Boot einen zufälligen Schlüssel: alle vor dem Neustart ausgestellten
  Challenges werden ungültig, und mehrere Instanzen verhalten sich unterschiedlich.

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
- **Speicher-Kontingent umgehbar (HOCH, im Review gefunden):** das Kontingent wird
  aus der _deklarierten_ `Upload-Length` berechnet, und der PATCH-Pfad hat diese
  Länge nicht erzwungen – ein Gast konnte eine kleine Datei ankündigen (damit die
  Quota greift) und anschließend bis zum Body-Limit der Laufzeit (512 KB bare
  Metal, `BODY_SIZE_LIMIT` im Docker-Image) größere Chunks senden. `appendUploadChunk`
  schrieb den Puffer ungeprüft, sodass auf der Platte bis zu 6,25× der angemeldeten
  Bytes landeten, während die Quota nur die Anmeldung bilanzierte. PATCH lehnt
  Chunks, die den verbleibenden deklarierten Bereich überschreiten, jetzt mit 413 ab.
  Reproduzierbar über `scripts/verify-quota-overshoot.py`.
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
