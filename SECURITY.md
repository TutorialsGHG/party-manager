# Sicherheit & Sicherheitsrichtlinie (Security Policy)

Wir nehmen die Sicherheit und Privatsphäre von _Einladung_ sehr ernst. Da die Anwendung mit Ende-zu-Ende-verschlüsselten Daten (Envelope Encryption, AES-256-GCM Chunks, RSA-4096 Master Key) arbeitet, bitten wir um verantwortungsvollen Umgang mit potenziellen Schwachstellen.

## Unterstützte Versionen

| Version | Unterstützt        |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Sicherheitslücken melden

Bitte erstelle **keine öffentlichen GitHub Issues** für sicherheitskritische Schwachstellen oder Exploits.

Stattdessen:

1. Nutze die [GitHub Security Advisories](https://github.com/) Funktion („Report a vulnerability“ auf der GitHub-Projektseite), sofern verfügbar.
2. Oder kontaktiere den Maintainer diskret per E-Mail.

Bitte gib eine detaillierte Beschreibung der Schwachstelle sowie Schritte zur Reproduktion (Proof of Concept) an. Wir werden den Bericht schnellstmöglich prüfen und einen Patch bereitstellen.

Details zur kryptografischen Architektur findest du in [`docs/SECURITY.md`](docs/SECURITY.md).
