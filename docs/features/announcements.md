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

Der Audience-Filter läuft **serverseitig**, und zwar über **eine einzige
Funktion**, die Seitenaufruf und SSE-Route gemeinsam benutzen:
`guestSeesAnnouncements()` in `src/lib/server/announcements/audience.ts`.

Das ist der entscheidende Punkt. Ein Filter im Template würde den Text trotzdem
in den Seiten-Payload schicken, wo ein Abgesagener ihn im Quelltext findet.
Serverseitig gefiltert existiert der Inhalt für diesen Gast nicht im Dokument.

Dass **beide** Wege dieselbe Funktion nutzen, ist keine Formalie: Als die
Ankündigungen eingeführt wurden, filterte nur der Seitenaufruf — die
SSE-Route überhaupt nicht prüfte. Ein abgesagener Gast bekam den Klartext daraufhin
trotzdem in Echtzeit. Zwei Stellen mit derselben Logik sind zwei Stellen, an
denen sie auseinanderlaufen können.

**Begleitpersonen** — der Fall, der eine eigene Begründung braucht: Sie haben
**nie** eine eigene Rückmeldung, weil `submitRsvp` Begleitpersonen mit einem 403
ablehnt. „Hat diese Person zugesagt?" ist für sie also nie über den eigenen RSVP
beantwortbar. Eine erste Fassung hatte dafür einen Begleit-Zweig, der
**unerreichbar** war (`companionInvites` ist nur gefüllt, wenn der _eigene_
RSVP „yes" ist) — das Feature war also sicher, aber die zugesagten Begleitungen
bekamen nichts, obwohl Commit-Text und Karte es versprochen hatten.

Korrekt ist, den **Gastgeber** über die beanspruchte Einladung zu ermitteln:
`findCompanionOwnerGuestId()` führt von der Begleitperson über
`guests.companion_invite_id` zu ihrem Gastgeber, und dessen RSVP entscheidet.
Eine Begleitperson eines Abgesagten bekommt die Nachricht damit korrekt _nicht_.

## 5. Abgrenzung zur Pinnwand

Die Pinnwand ist öffentlich für jeden mit dem Link. Die Ankündigung ist an die
Zusagen addressiert. Deshalb sind es zwei getrennte Tabellen und keine Option an
der Pinnwand.
