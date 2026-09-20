# Lokale Regeln: src/lib/server/crypto

1. Hier befinden sich die **einzigen** kryptografischen Primitive des Projekts.
2. Keine neuen Primitive oder Krypto-Bibliotheken ohne vorherigen Eintrag in `docs/DECISIONS.md` und `docs/SECURITY.md`.
3. Niemals Klartext-Schlüssel, Tokens oder Passwörter loggen (`console.log` ist streng verboten).
4. Jede Krypto-Funktion muss 100 % Unit-Test-Abdeckung in `tests/unit/crypto/` besitzen (einschließlich Tamper-, Replay- und Range-Tests).