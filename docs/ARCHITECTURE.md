# Architekturüberblick

## 1. Systemarchitektur
Die Einladungs-App ("Einladung") ist als Single-Container-Webanwendung konzipiert, die keine externen Datenbanken oder Cache-Server benötigt.

```
[Browser / PWA Client]
        │ HTTPS (Port 443)
[Reverse Proxy: Caddy / Nginx / Traefik]
        │ HTTP (Port 3000)
[SvelteKit Node-Server (adapter-node)]
   ├── src/routes/             (Dünne Routen, Guards, Response-Mapping)
   ├── src/lib/features/       (Fachliche Module: Events, RSVP, Polls, Wall, Gallery, Admin)
   ├── src/lib/server/crypto/  (Envelope Encryption: RSA-4096 Master + AES-256-GCM Chunks)
   ├── src/lib/server/db/      (SQLite WAL-Instanz & Repositories)
   ├── src/lib/server/storage/ (Verschlüsselte Blobs & tus Upload-Handler)
   ├── src/lib/server/media/   (Verarbeitungs-Queue: ffmpeg Transcoding & sharp/HEIC)
   └── src/lib/server/realtime/(Server-Sent Events Hub)
        │
   ├── Volume /data            (app.db, /blobs/ verschlüsselte Mediendateien)
   └── Volume /config          (master_priv.pem.enc, master_pub.pem, /keys/ Event-Keys)
```

## 2. Schichtenmodell & Abhängigkeitsregeln
- **Routes (`src/routes/`):** Verantwortlich nur für HTTP-Routing, URL-Parameter, Session-Prüfung und Aufruf der Feature-Services. Enthält kein SQL und keine Krypto-Logik.
- **Features (`src/lib/features/`):** Kapseln die Domänenlogik (z. B. Abstimmungen, Pinnwand, Gästeverwaltung).
- **Server-Core (`src/lib/server/`):**
  - `crypto/`: Ausschließlicher Ort für kryptografische Operationen.
  - `db/`: Einziger Ort mit SQL-Zugriff (Repositories).
  - `storage/`: Einziger Ort, der Blob-Dateien schreibt/liest.
  - `media/`: Hintergrund-Warteschlange für CPU-intensive Konvertierungen.
- **UI (`src/lib/ui/`):** Wiederverwendbare, zustandsarme Design-System-Komponenten und Design-Tokens.

## 3. Datenfluss bei Anfragen
1. Client sendet Request (z. B. `GET /e/:token`).
2. SvelteKit `hooks.server.ts` prüft Rate-Limits und setzt Security-Header (CSP mit Nonce, HSTS, no-referrer).
3. Route ruft den entsprechenden Feature-Service auf.
4. Feature-Service validiert Eingaben via Zod, autorisiert Zugriff und fragt das Repository ab.
5. Repository holt verschlüsselte Zeilen aus SQLite und entschlüsselt vertrauliche Felder über `lib/server/crypto` mit dem im RAM gecachten Event-Key (EK).
6. Antwort wird an den Client ausgeliefert.