export type MediaStatus = 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';

export interface MediaItem {
  id: string;
  eventId: string;
  uploaderGuestId: string;
  uploaderName?: string;
  mimeType: string;
  originalSize: number;
  processedSize: number | null;
  durationSeconds: number | null;
  status: MediaStatus;
  blurhash: string | null;
  originalFilename: string;
  createdAt: number;
}
