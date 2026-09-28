# Design-System & UI-Vorgaben

## 1. Philosophie: Apple-Look

- **Ruhig und minimalistisch:** Großzügiger Weißraum, klare Typografie, dezent eingesetzte Unschärfe (`backdrop-filter`).
- **Kein KI-Einheitsbrei:** Keine lila/blauen Farbverläufe, kein generisches Dashboard-Muster, keine Emojis als Icons.
- **Einheitliche Icons:** `@lucide/svelte` mit konsistenter Strichbreite (1.75 - 2px).

## 2. Typografie & Raster

- **Schriften:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, sans-serif`.
- **Raster:** 8-pt Raster (`8px`, `16px`, `24px`, `32px`, `48px`).
- **Radien:** Kontinuierliche Kurven (Squircle-Anmutung):
  - Buttons / Controls: `12px` bis `14px`
  - Karten / Dialoge / Sheets: `18px` bis `22px`

## 3. Akzentfarben & WCAG AA Kontrast-Garantie

Der Host wählt eine Akzentfarbe für das Event. Das System leitet dynamisch die Tokens ab:

- `--accent`: Basis-Farbe
- `--accent-contrast`: Automatisch berechnet (`#ffffff` oder `#000000`) für mindestens 4.5:1 Kontrastverhältnis.
- `--accent-subtle`: 10-15% Deckkraft der Akzentfarbe für Hintergründe von aktiven Tabs oder Badges.
- Automatische Helligkeits- und Sättigungskorrektur, falls die vom Host gewählte Farbe den Mindestkontrast auf hellem bzw. dunklem Hintergrund verfehlt.

## 4. Mobile Ergonomie

- Mindest-Schriftgröße `16px` in Inputs (verhindert automatisches iOS Safari-Zooming).
- Touch-Targets mindestens `44px × 44px`.
- Berücksichtigung von Safe-Area-Insets (`env(safe-area-inset-bottom)` etc.) und dynamischen Viewports (`dvh`).
- Bottom Sheets auf Smartphones, zentrierte Modaldialoge auf Desktop.
