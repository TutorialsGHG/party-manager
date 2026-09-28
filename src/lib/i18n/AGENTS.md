# Lokale Regeln: src/lib/i18n

1. Keine hartcodierten Anzeigetexte im Quellcode.
2. Alle Schlüssel in `de.json` müssen exakt deckungsgleich in `en.json` vorhanden sein.
3. Datums-, Zeit- und Zahlenformatierungen erfolgen ausschließlich über native `Intl`-Formatierer.
4. Vor dem Einchecken muss `pnpm check:i18n` fehlerfrei durchlaufen.
