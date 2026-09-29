# Feature-Karte: Medien & Foto-Galerie

## 1. Zweck & Umfang

Upload, verschlüsselte Speicherung, Transcoding und Anzeige von Fotos und Videos.

## 2. Datenmodell

- `media`: ID, event_id, uploader_guest_id, mime_type, original_size, processed_size, status (uploading/processing/ready), verschlüsselter File-Key, Blurhash

## 3. Upload & Verarbeitung

- tus Resumable Upload Protokoll mit Chunk-Verschlüsselung (AES-256-GCM)
- Autorisierung für `POST`, `HEAD`, `PATCH` und `DELETE`: nur der Host des Events
  oder der Gast, der die Session eröffnet hat (Device-Token über Cookie oder
  `X-Guest-Token`). Die Session-UUID allein gewährt keinen Zugriff.
- Magic-Byte-Prüfung (JPEG, PNG, WebP, HEIC/HEIF, MP4, MOV, WebM)
- Queue: `sharp` für Thumbnails/Blurhash (EXIF-Entfernung), `ffmpeg` für H.264/AAC Transcoding
- Originale bleiben verschlüsselt gespeichert und sind herunterladbar
- Speicher-Kontingent `quotaPerEventMb` wird bei `POST /api/upload` geprüft. Gezählt
  werden abgeschlossene Medien (`ready`/`failed`) sowie die gerade laufenden
  Uploads, damit parallele Uploads begrenzt bleiben. Verwaiste `uploading`-Sessions
  zählen bewusst **nicht** mit und werden nach 24 Stunden per TTL-Cleanup entfernt
  (beim Start und danach täglich) – sonst könnte ein Gast das Kontingent eines
  Events blockieren, indem er Sessions eröffnet und nie Daten sendet.

## 4. Lightbox & UX

- Gestengesteuerte Lightbox mit Pinch-Zoom, Swipe und Range-Streaming für Video-Seeking
- Neue Medien und Löschungen erscheinen über SSE ohne Seiten-Reload bei Gästen und Host
