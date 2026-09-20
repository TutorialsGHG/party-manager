# Entscheidungslog (ADR)

Entscheidungen zur Architektur, Bibliotheken und Abweichungen vom Standard.

---

## ADR-001: SvelteKit mit Svelte 5 Runes und adapter-node
- **Status:** Angenommen
- **Kontext:** Moderne Web-App mit PWA, Server-Side Rendering für First-Paint und strikte Trennung zwischen Server- und Clientcode.
- **Entscheidung:** Einsatz von SvelteKit mit Svelte 5 (`$state`, `$derived`, `$props`) und `adapter-node`.
- **Konsequenzen:** Keine React-Abhängigkeiten, schlankes JavaScript-Bundle, exzellente Performance auf Low-End Mobilgeräten.

---

## ADR-002: SQLite mit WAL-Modus und native Builds
- **Status:** Angenommen
- **Kontext:** Single-Container-Deployment ohne externe Datenbankdienste (kein PostgreSQL/MySQL).
- **Entscheidung:** Einsatz von `better-sqlite3` im WAL-Modus (`journal_mode = WAL`, `synchronous = NORMAL`, `secure_delete = ON`).
- **Konsequenzen:** Extrem schnelle Transaktionen, In-Process-Abfragen, minimale RAM-Nutzung (1-2 GB Host völlig ausreichend).

---

## ADR-003: Envelope-Verschlüsselung (RSA-4096 + AES-256-GCM Chunks)
- **Status:** Angenommen
- **Kontext:** At-Rest-Verschlüsselung für alle privaten Event-Daten und Medien. Schutz vor gestohlenen Backups und Datenträgern.
- **Entscheidung:** Master-Schlüsselpaar RSA-4096 im Config-Volume (`/config/keys`). Event-Keys (256-bit) per RSA-OAEP verpackt. Medieninhalte werden in 1-MiB-Chunks mit AES-256-GCM und dateispezifischer AAD verschlüsselt.
- **Konsequenzen:** Ermöglicht echtes Crypto-Shredding durch Löschung des Event-Keys. Range-Requests für Audio/Video-Streaming bleiben performant möglich.

---

## ADR-004: Server-Sent Events (SSE) anstelle von WebSockets
- **Status:** Angenommen
- **Kontext:** Live-Updates für RSVP, Pinnwand und Umfragen.
- **Entscheidung:** Verwendung von Standard-HTTP Server-Sent Events (`text/event-stream`).
- **Konsequenzen:** Einfacheres Proxying über Standard-Reverse-Proxies (Caddy/Nginx/Traefik) ohne WebSocket-Upgrade-Komplexität. Geringer Overhead.

---

## ADR-005: Autarke Lokale Assets (Keine externen CDNs/Fonts)
- **Status:** Angenommen
- **Kontext:** Maximale Privatsphäre und Offline-Robustheit.
- **Entscheidung:** Apple System Fonts (`-apple-system`, `BlinkMacSystemFont`, `SF Pro`), Fallback auf lokale Schriftart Inter. Icons lokal über `@lucide/svelte`. Keine externen Google Fonts oder CDNs.
- **Konsequenzen:** Vollständige Unabhängigkeit von externen Diensten, kein Tracking, strikteste CSP möglich.