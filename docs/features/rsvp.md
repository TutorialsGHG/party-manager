# Feature-Karte: Zu- und Absagen (RSVP)

## 1. Zweck & Umfang

Gäste sagen zu, vielleicht oder ab, tragen Begleitpersonen und Notizen (z. B. Allergien) ein.

## 2. Datenmodell

- `rsvps`: ID, event_id, guest_id, status (yes/maybe/no), companion_count, verschlüsselte Felder (companion_names, notes), updated_at

## 3. Funktionen & UX

- Gast sieht eigene Antwort und aggregierte Gesamtliste der Teilnehmer
- Host legt die Anzahl reservierter Begleitplätze pro Einladung fest; Gäste können sie nicht selbst verändern
- Zusagende Hauptgäste können persönliche, einmalig einlösbare Begleitlinks teilen
- Begleitpersonen können keinen eigenen RSVP-Status setzen
- Nach dem Speichern zeigt die RSVP-Karte nur noch den gewählten Status und kann bei Bedarf geöffnet werden
- Live-Aktualisierung über SSE
- Optimistische UI-Updates beim Absenden

## 4. Berechtigungen

- Gast kann nur die eigene Antwort auf demselben Gerät bearbeiten/löschen
- Host kann Teilnehmer moderieren und Zusammenfassungen einsehen
