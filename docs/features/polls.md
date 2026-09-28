# Feature-Karte: Umfragen & Abstimmungen

## 1. Zweck & Umfang

Host erstellt Abstimmungen für Termine, Essen, Mottos etc. Gäste stimmen ab.

## 2. Datenmodell

- `polls`: ID, event_id, is_multiple, allow_guest_options, is_anonymous, deadline, is_closed, verschlüsselte Frage
- `poll_options`: ID, poll_id, created_by_guest_id, sort_order, verschlüsselter Text
- `poll_votes`: ID, poll_id, option_id, guest_id (NULL bei anonymen Umfragen)

## 3. Funktionen & UX

- Einfach- oder Mehrfachauswahl, Text- oder Termin-Optionen
- Gäste dürfen optional eigene Optionen hinzufügen
- Live-Balken und Stimmenzählung über SSE ohne Seiten-Reload; der Host sieht zusätzlich die Stimmen je Option
- Anonyme oder namentliche Stimmabgabe

## 4. Berechtigungen

- Gast kann Stimme ändern, solange Umfrage nicht geschlossen oder Deadline abgelaufen ist
- Host kann Umfragen schließen oder löschen
