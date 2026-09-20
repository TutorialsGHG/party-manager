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