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