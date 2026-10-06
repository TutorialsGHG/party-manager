# Backup- und Restore-Leitfaden

> **Getestet.** `tests/unit/security/backup-restore-roundtrip.test.ts` führt den
> hier beschriebenen Ablauf tatsächlich aus: Er schreibt in einem eigenen Prozess ein
> Event mit verschlüsselten Feldern, einer RSVP und einem echten verschlüsselten
> Medien-Blob, kopiert beide Volumes, liest sie in einem **zweiten, völlig frischen
> Prozess** zurück und vergleicht Titel, Notizen und Blob-Prüfsumme. Ohne
> `/config` und mit falscher Passphrase muss der Wiederherstellen-Vorgang
> scheitern — beides ist als Negativtest festgeschrieben.

## 1. Trennung der Volumes

Die App verwendet zwei getrennte Verzeichnisse/Volumes:

1. `/data`: Enthält die SQLite-Datenbank (`app.db`) und verschlüsselte Blobs (`/blobs/`).
2. `/config`: Enthält den Master-Schlüssel (`/keys/master_priv.pem.enc`, `/keys/master_pub.pem`) und die verpackten Event-Schlüssel (`/keys/events/{id}.key`).

> [!IMPORTANT]
> **Ohne die Schlüssel in `/config` sind Backups von `/data` vollständig wertlos!**
> Die Daten können ohne den privaten Master-Schlüssel und die Passphrase nicht wiederhergestellt werden.

## 2. Backup-Strategie & Aufbewahrungszeiten

- **`/data` (Inhalte):** Kann regulär im Rahmen der normalen Backup-Zyklen (z. B. täglich/wöchentlich) gesichert werden.
- **`/config/keys/events/` (Keystore):** Sollte eine **kurze Aufbewahrungsfrist** haben. Grund: Wenn ein Event gelöscht wird (Crypto-Shredding), würde ein langes Vorhalten alter Keystore-Backups ermöglichen, ein gelöschtes Event aus alten Daten-Backups wieder lesbar zu machen.

## 3. Manuelles Backup

```bash
# 1. SQLite sichern (online ohne Stillstand)
sqlite3 /data/app.db ".backup '/backup/app_$(date +%F).db'"

# 2. Blobs sichern
rsync -av /data/blobs/ /backup/blobs/

# 3. Schlüssel separat und verschlüsselt sichern
rsync -av /config/keys/ /backup/keys_secure/
```

## 4. Wiederherstellung (Restore)

1. Volumes `/data` und `/config` bereitstellen.
2. Schlüssel in `/config/keys/` wiederherstellen (Dateirechte prüfen: `chmod 600`).
3. Datenbank nach `/data/app.db` und Blobs nach `/data/blobs/` kopieren.
4. Container mit gesetzter `ENCRYPTION_PASSPHRASE` starten.
