# Lokale Regeln: tests

1. Unit-Tests (`tests/unit/`) testen Krypto, Berechtigungen und Domänenlogik isoliert.
2. E2E-Tests (`tests/e2e/`) decken Kernflows von 320px mobiler Breite bis Desktop ab.
3. Vor jedem Commit müssen alle Tests fehlerfrei sein; Tests dürfen niemals deaktiviert (`.skip`) oder abgeschwächt werden.