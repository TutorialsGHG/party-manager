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
Seite neu lädt. Genau deshalb ist der Gast-Client an den Broadcasts des Hosts
festgebunden: `tests/unit/features/wall-sse-contract.test.ts` liest beide
Dateien und schlägt fehl, sobald der Host ein Wall-Ereignis sendet, für das der
Gast keinen Listener registriert. Ein neuer Broadcast ohne Gegenstück bricht
damit sofort die CI.

Die lokale Neu-Sortierung nach einem Pin-Wechsel bildet die Reihenfolge von
`listWallPosts()` nach (`is_pinned DESC, created_at DESC`) exakt ab, damit ein
Anpinnen den Beitrag nicht dorthin springen lässt, wo ein Reload ihn
wieder hinterlässt.
