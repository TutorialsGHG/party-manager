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
  (Single-Use: jede Lösung kann genau einmal eingelöst werden)
- Rate-Limiting am Login: 5 Fehlversuche pro Konto in 15 Minuten, danach HTTP 429.
  Bewusst **pro Konto, nicht pro IP** – bei einem Schulfest teilen sich alle Gäste
  dieselbe öffentliche IP, ein IP-Limit würde die ganze Gruppe aussperren.
  Registrierung ist durch die PoW-Challenge und die Admin-Einstellung
  `registrationEnabled` begrenzt, ein IP-basiertes Limit existiert dort nicht.
- Identische Antworten bei existierenden und unbekannten E-Mail-Adressen
  (Anti-Enumeration) – sowohl im Login (Dummy-Argon2-Hash) als auch in der
  Registrierung (generische Fehlermeldung + Dummy-Hash). Beide Zweige kosten
  genau eine Argon2id-Operation; der Dummy-Hash (`DUMMY_ARGON2_HASH`) muss die
  Parameter der echten Hashes spiegeln, sonst entsteht die Zeitlücke wieder.

## 5. Sessions & Cookies

- Session-Token: 32 Byte Zufall, nur der SHA-256-Hash liegt in der DB.
- Cookie-Name und `secure`-Flag stammen beide aus `BASE_URL`: `__Host-session`
  wird nur bei HTTPS gesetzt, sonst `session`. Der `__Host-`-Prefix verlangt
  `Secure` und `Path=/` – eine Kombination aus `NODE_ENV=production` und
  HTTP-`BASE_URL` würde einen Browser dazu bringen, den Cookie zu verwerfen.
- Ablauf: 30 Tage absolut, 7 Tage Idle-Timeout (gilt erst nach Migration 005;
  ältere Sessions ohne `last_seen_at` bleiben gültig).
- Beim Login wird eine bestehende Session gelöscht und ein neuer Token ausgestellt.
- `Cache-Control: private, no-store` und `Vary: Cookie` auf allen HTML-Antworten.
