# Feature-Karte: Host-Ankündigungen

## 1. Zweck & Umfang

Kurze Nachrichten des Hosts an die Gäste, die **zugesagt** haben — „Bitte
Getränke bis Freitag mitbringen". Bewusst nicht an alle, die den Link offen
haben: wer abgesagt hat, muss solche Nachrichten nicht erhalten.

## 2. Datenmodell

- `event_announcements`: ID, event_id, author_guest_id, verschlüsselter Inhalt
  (content_cipher), audience, created_at
- Migration `008_event_announcements.sql`

Der Inhalt wird wie jede andere gastenseitige Nutzlast mit dem Event-Key
verschlüsselt (`announcements:<id>:content` als AAD). Eine Ankündigung ist aus
der Datenbankdatei also nicht im Klartext lesbar — das ist die Privacy-These des
Projekts, keine Ausnahme davon.

`audience` wird mitgespeichert, damit die Absicht nachvollziehbar bleibt, auch
wenn sich eine Rückmeldung später ändert.

## 3. Schnittstellen & Funktionen

- Host sendet im Event-Panel eine Ankündigung (max. 500 Zeichen) und kann sie
  wieder löschen
- Gastenseite zeigt die Ankündigungen über der Pinnwand, jeweils mit Zeitangabe
- SSE: `announcement:new` und `announcement:delete` aktualisieren beide Seiten
  ohne Neuladen

## 4. Berechtigungen — der Kern des Features

Der Audience-Filter läuft **serverseitig** im `load()` der Einladungsseite:

```ts
const hasConfirmed =
	rsvp?.status === 'yes' || (!!currentGuest?.isCompanion && !!companionInvites.length);
const announcements = hasConfirmed ? listAnnouncements(event.id) : [];
```

Das ist entscheidend: Ein Filter im Template würde den Text trotzdem in den
Seiten-Payload schicken, wo ein Abgesagener ihn im Quelltext oder in der
DevTools-Konsole findet. Serverseitig gefiltert existiert der Inhalt für diesen
Gast überhaupt nicht im Dokument.

Begleitpersonen sehen die Ankündigungen, wenn ihr Gastgeber zugesagt hat — sie
gehören zu dieser Rückmeldung.

## 5. Abgrenzung zur Pinnwand

Die Pinnwand ist öffentlich für jeden mit dem Link. Die Ankündigung ist an die
Zusagen addressiert. Deshalb sind es zwei getrennte Tabellen und keine Option an
der Pinnwand.
