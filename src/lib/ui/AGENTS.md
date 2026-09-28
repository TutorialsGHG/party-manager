# Lokale Regeln: src/lib/ui

1. Alle Farben, Schriften, Abstände und Schatten stammen aus den Tokens in `tokens/`. Keine hartcodierten Hex-Farben oder Schriftarten in Komponenten.
2. Ausschließlich `@lucide/svelte` Icons mit Strichbreite 1.75 - 2px verwenden (keine Emojis als Icons).
3. Jede interaktive Komponente muss Touch-Ziele von mindestens 44x44px und WCAG AA Konformität besitzen.
4. Jede Ansicht muss Lade- (Skeleton), Leer- und Fehlerzustände bereitstellen.
