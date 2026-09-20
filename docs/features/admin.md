# Feature-Karte: Admin-Bereich & Systemverwaltung

## 1. Zweck & Umfang
Zentrale Steuerung für den Administrator (erster registrierter Nutzer).

## 2. Einstellungsoptionen
- Registrierung an/aus
- Speicher-Limits (max. Uploadgröße, Quota pro Event/User)
- Benutzerverwaltung (sperren, löschen, 2FA-Zwang)
- Systemstatus (Queue-Länge, ffmpeg-Verfügbarkeit, Speicherverbrauch)
- SMTP-Konfiguration mit Testmail-Funktion (verschlüsselt in DB abgelegt)

## 3. Berechtigungen
- Zugriff nur mit aktiver Admin-Session
- Strenges CSRF- und Rate-Limiting