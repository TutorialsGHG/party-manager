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
- CSRF-Schutz durch SvelteKits `checkOrigin` (POST/PUT/PATCH/DELETE mit fremdem
  Origin werden mit 403 abgewiesen)
- Kein IP-basiertes Rate-Limiting im Admin-Bereich. Das Login ist pro Konto
  gedrosselt (siehe `docs/features/auth.md`), Admin-Actions sind es nicht.
