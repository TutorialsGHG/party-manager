# Feature-Karte: Pinnwand & Gästebuch

## 1. Zweck & Umfang

Gemeinsame Pinnwand für Ankündigungen des Hosts und Nachrichten/Glückwünsche der Gäste.

## 2. Datenmodell

- `wall_posts`: ID, event_id, guest_id, is_pinned, verschlüsselter Inhalt (content_text), created_at

## 3. Funktionen & UX

- Kurze Textnachrichten mit relativer, lokalisierter Zeitangabe
- Host kann wichtige Beiträge oben anpinnen
- SSE-Stream für sofortige Anzeige neuer Beiträge ohne Neuladen
- Saubere Leerzustände und Skeleton-Screens beim Laden

## 4. Berechtigungen

- Gast kann eigene Beiträge löschen
- Host kann alle Beiträge moderieren, löschen oder anpinnen

## 5. Live-Synchronisation der Moderation

Der Host sendet bei Moderationsschritten eigene SSE-Ereignisse, die Gäste
unverzüglich verarbeiten:

| Aktion           | SSE-Ereignis  | Wirkung beim Gast             |
| ---------------- | ------------- | ----------------------------- |
| Beitrag senden   | `wall:new`    | Beitrag erscheint ohne Reload |
| Beitrag anpinnen | `wall:update` | Beitrag springt nach oben     |
| Beitrag löschen  | `wall:delete` | Beitrag verschwindet          |

**Ein fehlendes Abonnement fällt nicht auf.** Die Oberfläche rendert in jedem
Fall korrekt — der Gast sieht lediglich einen veralteten Zustand, bis er die
Seite neu lädt. Genau deshalb ist der Gast-Client an die Broadcasts des Hosts
festgebunden.

`tests/unit/features/wall-sse-contract.test.ts` schlägt fehl, sobald ein
Wall-Ereignis aus **irgendeiner** Datei unter `src/` gesendet wird, für das der
Gast keinen Listener registriert. Eine erste Fassung las nur eine einzige Datei
und war damit untauglich — eine unabhängige Prüfung injizierte `wall:archive`
in `src/routes/e/[token]/+page.server.ts`, das ebenfalls Wall-Ereignisse sendet,
und der Test blieb grün. Der Test wandert jetzt über den gesamten `src`-Baum und
prüft zusätzlich alle Nicht-Wall-Ereignisse.

Grenzen, offen benannt: Das ist eine Quelltext-Prüfung, keine Verhaltensprüfung.
Sie erkennt Broadcasts in der Schreibweise, nach der sie sucht — einfach
gequotete Eventnamen. Ein Broadcast über eine umbenannte Hilfsfunktion oder einen
Alias würde durchrutschen. Für den konkreten Fehler, um den es hier geht, ist sie
belastbar; als dauerhafte Schranke ist sie eine gute, keine vollständige.

**Pin-Updates sind konvergent, nicht blind.** `wall:update` trägt den absoluten
Zustand (`isPinned`), nicht nur die `postId`. Ein Client, der lokal umschaltet,
kann nach einem einzigen verlorenen Ereignis dauerhaft invertiert bleiben: der
nächste Schaltvorgang dreht dann in die falsche Richtung, bis etwas
Unverwandtes einen Reload auslöst. Mit absolutem Zustand konvergiert ein
verpasstes oder doppelt zugestelltes Ereignis statt zu driften.
`tests/unit/features/pin-state-convergence.test.ts` hält diese Eigenschaft fest.

Die lokale Neu-Sortierung nach einem Pin-Wechsel bildet die Reihenfolge von
`listWallPosts()` nach (`is_pinned DESC, created_at DESC`) exakt ab, damit ein
Anpinnen den Beitrag nicht dorthin springen lässt, wo ein Reload ihn
wieder hinterlässt.
