# AGENTS.md - Leitfaden für KI-Agenten

## 1. Projekt in 5 Zeilen
- **Zweck:** Selbst gehostete Einladungs-App (PWA) für Partys & Geburtstage ("Einladung").
- **Stack:** SvelteKit (Svelte 5 Runes, adapter-node), SQLite (better-sqlite3, WAL), Node.js 22 LTS.
- **Prinzipien:** 100 % Privatsphäre (keine externen CDNs/Fonts/Analytics/Tiles), ein einziges Docker-Image.
- **Sicherheit:** Envelope-Verschlüsselung (RSA-4096 Master + AES-256-GCM Chunks), Crypto-Shredding.
- **Design:** Ruhiger Apple-Look (SF Pro/Inter, 8-pt Raster, native Gesten, kein generischer KI-Slop).

## 2. Wichtige Befehle
- `pnpm dev`: Entwicklungsserver starten
- `pnpm build`: Produktions-Build erzeugen
- `pnpm check`: SvelteKit TypeScript Typecheck (`svelte-check`)
- `pnpm lint`: Prettier und ESLint Prüfung
- `pnpm test:unit`: Vitest Unit-Tests ausführen
- `pnpm test:e2e`: Playwright End-to-End Tests
- `pnpm test:ci`: Vollständiger CI-Lauf (Lint, Check, Unit, Boundaries, i18n, Docs, No-External)

## 3. Wo finde ich was?
| Aufgabe / Bereich | Quellcode-Ordner | Dokumentation |
|---|---|---|
| Krypto & Schlüsselverwaltung | `src/lib/server/crypto/` | `docs/SECURITY.md` |
| Datenbank & Migrationen | `src/lib/server/db/` | `docs/ARCHITECTURE.md` |
| Verschlüsselter Blob-Speicher & tus | `src/lib/server/storage/` | `docs/SECURITY.md` |
| Medien, Queue, ffmpeg, sharp | `src/lib/server/media/` | `docs/features/gallery.md` |
| Realtime-Updates (SSE) | `src/lib/server/realtime/` | `docs/ARCHITECTURE.md` |
| Auth, Passkeys, TOTP, Recovery | `src/lib/server/auth/` | `docs/features/auth.md` |
| Optionales SMTP | `src/lib/server/mail/` | `docs/features/admin.md` |
| Events & Einladungs-Links | `src/lib/features/events/` | `docs/features/events.md` |
| Zu-/Absagen (RSVP) | `src/lib/features/rsvp/` | `docs/features/rsvp.md` |
| Umfragen & Abstimmungen | `src/lib/features/polls/` | `docs/features/polls.md` |
| Pinnwand & Kommentare | `src/lib/features/wall/` | `docs/features/wall.md` |
| Foto-/Video-Galerie | `src/lib/features/gallery/` | `docs/features/gallery.md` |
| Admin-Bereich & Limits | `src/lib/features/admin/` | `docs/features/admin.md` |
| Design-System & Tokens | `src/lib/ui/` | `docs/DESIGN-SYSTEM.md` |
| Internationalisierung (i18n) | `src/lib/i18n/` | `docs/DECISIONS.md` |
| Thin Routing & Pages | `src/routes/` | `docs/ARCHITECTURE.md` |

## 4. Leseanleitung für Agenten
1. Lies diese Datei (`AGENTS.md`).
2. Lies die nächstgelegene verschachtelte `AGENTS.md` des betroffenen Moduls.
3. Lies die zugehörige Feature-Karte in `docs/features/<feature>.md`.
4. Bearbeite nur die minimal betroffenen Dateien. Durchsuche nicht unnötig das gesamte Repository.

## 5. Harte Regeln & Sicherheits-Rote-Linien
1. **Keine externen Requests:** Absolut keine externen CDNs, Fonts, Tracker oder Tiles. Lokale Assets ausliefern.
2. **Krypto isoliert:** Kryptografische Primitive ausschließlich in `src/lib/server/crypto/`. Niemals Klartext-Schlüssel, Tokens oder Passwörter loggen.
3. **Database-Grenzen:** Kein SQL in Routes oder UI. Nur Repositories in `src/lib/server/db/` sprechen mit SQLite.
4. **Schichten-Disziplin:** `routes` -> `features` -> `server`-Module und `ui`/`shared`. Keine zyklischen Abhängigkeiten.
5. **UI-Konsistenz:** Nur Tokens und Basiskomponenten aus `src/lib/ui/` nutzen. Keine festen Hex-Farben oder Inline-Font-Families.
6. **Zweisprachig:** Alle Texte über i18n (`de.json` und `en.json`). Datum/Zahlen über `Intl`.
7. **Mechanische Durchsetzung:** Niemals Linter- oder Testregeln abschwächen oder übergehen.

## 6. Definition of Done für Features
- [ ] Feature-Karte in `docs/features/<feature>.md` vorhanden und aktuell
- [ ] Zod-Schemas für alle Validierungen definiert
- [ ] Datenbank-Migration und Repository implementiert (sensible Felder verschlüsselt)
- [ ] Serverlogik abgesichert (Auth, Autorisierung, Rate-Limiting)
- [ ] UI mit Skeleton-, Leer- und Fehlerzustand, responsiv (320px bis Desktop), WCAG AA Kontrast
- [ ] i18n Schlüssel synchron in `de.json` und `en.json`
- [ ] Unit- und E2E-Tests vorhanden und grün
- [ ] CI-Lauf (`pnpm test:ci`) fehlerfrei
- [ ] Eintrag in `CHANGELOG.md`