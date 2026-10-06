# Feature-Karte: Events & Einladungen

## 1. Zweck & Umfang

Verwaltung von Events durch den Host und Zugriff für Gäste über Einladungslinks.

## 2. Datenmodell

- `events`: ID, token_hash (SHA-256), host_id, date_start, date_end, accent_color, verschlüsselte Felder (title, description, location_name, location_address)

## 3. Schnittstellen & Funktionen

- URL: `/e/:token` (128-Bit Base64URL-Token)
- Countdown bis Eventstart
- Location-Buttons ("In Apple Maps öffnen", "In OpenStreetMap öffnen", "In Google Maps öffnen") ohne eingebettete iFrames
- .ics Kalender-Export und lokaler SVG QR-Code Download
- Einladungslink neu generieren oder Event unwiderruflich löschen (Crypto-Shredding)

## 4. Berechtigungen

- Host: Vollzugriff auf eigene Events
- Gast: Lesezugriff auf Event-Details bei gültigem Token

## 5. Teilnehmende-Übersicht (Host)

`getRsvpSummary` liest ausschliesslich die Tabelle `rsvps`. Ein Gast, der die
Einladung geöffnet hat, auf der Pinnwand geschrieben oder Fotos hochgeladen hat,
aber keine Rückmeldung abgegeben hat, ist dort **strukturell unsichtbar** — es
gibt schlicht keinen Datensatz, über den aggregiert werden könnte.

Deshalb existiert zusätzlich `listGuestOverview(eventId)` in
`src/lib/server/db/repositories/guest.repository.ts`. Sie liest die Tabelle
`guests` als führende Tabelle (`LEFT JOIN` auf `rsvps`) und liefert je Gast:

- Namen (entschlüsselt), Host-/Begleit-Markierung, Anlagedatum
- RSVP-Status oder `null` für "keine Rückmeldung"
- Begleitpersonen: Anzahl und entschlüsselte Namen
- Aktivität: Anzahl Pinnwand-Beiträge und Anzahl Uploads

Die Aktivitätszähler kommen aus gruppierten Subqueries, nicht aus Abfragen pro
Gast, damit die Abfrage unabhängig von der Gästezahl einzelner Round-Trips
bleibt. Die Subqueries sind auf `event_id` gefiltert, damit Aktivität eines
anderen Events desselben Hosts nicht durchschlägt.

**Verschlüsselungsdetail:** `companion_names_cipher` wird mit der AAD der
RSVP-_Zeilen_-ID (`rsvps:<rsvp-id>:companion_names`) entschlüsselt, nicht mit
der Gast-ID. Das ist in den Tests festgeschrieben, weil ein Verwechslen der
beiden IDs zur Laufzeit einen Entschlüsselungsfehler wirft und nicht zu einem
stillen Leerwert führt.

**Begleitnamen aus einer einzigen Quelle:** Die Namen der Begleitpersonen liest
die Übersicht aus `companion_invites` — **nicht** aus dem kommaseparierten
Klartext in `companion_names_cipher`.

Das ist bewusst so: `getRsvpSummary()` liest sie ebenfalls aus
`companion_invites`, und beide Karten stehen auf **derselben** Host-Seite. Ein
Splitten des Chiffretexts ist in beide Richtungen unzuverlässig — ein Name mit
Komma („Mueller, Anna") zerfällt in zwei Namen, ein leerer Slot ergibt weniger
Namen als Begleitungen — und die beiden Ansichten widersprächen sich dann für
identische Daten. Eine gemeinsame Quelle beseitigt die ganze Fehlerklasse.
