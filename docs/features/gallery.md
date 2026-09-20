# Feature-Karte: Medien & Foto-Galerie

## 1. Zweck & Umfang
Upload, verschlüsselte Speicherung, Transcoding und Anzeige von Fotos und Videos.

## 2. Datenmodell
- `media`: ID, event_id, uploader_guest_id, mime_type, original_size, processed_size, status (uploading/processing/ready), verschlüsselter File-Key, Blurhash

## 3. Upload & Verarbeitung
- tus Resumable Upload Protokoll mit Chunk-Verschlüsselung (AES-256-GCM)
- Magic-Byte-Prüfung (JPEG, PNG, WebP, HEIC/HEIF, MP4, MOV, WebM)
- Queue: `sharp` für Thumbnails/Blurhash (EXIF-Entfernung), `ffmpeg` für H.264/AAC Transcoding
- Originale bleiben verschlüsselt gespeichert und sind herunterladbar

## 4. Lightbox & UX
- Gestengesteuerte Lightbox mit Pinch-Zoom, Swipe und Range-Streaming für Video-Seeking