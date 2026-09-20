# Feature-Karte: Authentifizierung & Konten (Auth)

## 1. Zweck & Umfang
Host-Konten für die Event-Erstellung. Erster registrierter Nutzer wird automatisch Administrator.

## 2. Authentifizierungs-Methoden
- E-Mail und Passwort (Argon2id Hash)
- 10 Einmalige Recovery-Codes (gehasht gespeichert, immer verfügbar)
- Passkeys (WebAuthn FIDO2) als passwortloser Login oder 2. Faktor
- TOTP (RFC 6238) mit QR-Code Einrichtung
- Optionales SMTP für Passwort-Reset per Link und E-Mail-Verifikation

## 3. Datenmodell
- `users`: ID, gehashte E-Mail, verschlüsselte E-Mail, Argon2id Passwort, Rolle, 2FA-Status
- `passkeys`: ID, User-ID, Credential-ID, Public-Key, Counter
- `totp_secrets`: User-ID, verschlüsseltes Secret
- `recovery_codes`: ID, User-ID, SHA-256 Hash des Codes, used_at

## 4. Berechtigungen & Schutz
- PoW-Challenge (SHA-256) bei Registrierung gegen Bots ohne externe Captchas
- Rate-Limiting pro IP auf Login und Registrierung
- Identische Antworten bei existierenden und unbekannten E-Mail-Adressen (Anti-Enumeration)