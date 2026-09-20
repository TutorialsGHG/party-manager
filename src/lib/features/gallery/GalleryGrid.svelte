<script lang="ts">
  import { Play, Image as ImageIcon } from '@lucide/svelte';
  import Lightbox, { type LightboxMedia } from './Lightbox.svelte';
  import UploadZone from './UploadZone.svelte';
  import type { MediaItem } from './types.js';

  interface Props {
    items: MediaItem[];
    eventId: string;
    guestToken?: string;
    canDelete?: (item: MediaItem) => boolean;
    onDelete?: (item: MediaItem) => Promise<void>;
    showUpload?: boolean;
    onUploadComplete?: (mediaId: string) => void;
  }

  let {
    items = $bindable([]),
    eventId,
    guestToken,
    canDelete,
    onDelete,
    showUpload = true,
    onUploadComplete
  }: Props = $props();

  let activeLightboxIndex = $state<number | null>(null);

  function isVideo(item: MediaItem): boolean {
    return item.mimeType.startsWith('video/') || /\.(mov|mp4|webm)$/i.test(item.originalFilename);
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function openLightbox(index: number) {
    activeLightboxIndex = index;
  }

  function closeLightbox() {
    activeLightboxIndex = null;
  }

  async function handleDelete(item: LightboxMedia) {
    if (onDelete) {
      const original = items.find((i) => i.id === item.id);
      if (original) {
        await onDelete(original);
      }
    }
  }
</script>

<div class="gallery-container">
  {#if showUpload}
    <UploadZone
      {eventId}
      {guestToken}
      onUploadComplete={(id) => {
        if (onUploadComplete) onUploadComplete(id);
      }}
    />
  {/if}

  {#if items.length === 0}
    <div class="empty-gallery">
      <div class="empty-icon">
        <ImageIcon size={40} />
      </div>
      <h3>Noch keine Fotos oder Videos</h3>
      <p>Halte die schönsten Momente fest und teile sie hier mit allen!</p>
    </div>
  {:else}
    <div class="media-grid">
      {#each items as item, index (item.id)}
        <button
          class="grid-item"
          onclick={() => openLightbox(index)}
          aria-label="Medienelement ansehen"
        >
          <img
            src="/api/media/{item.id}/thumbnail"
            alt={item.originalFilename}
            loading="lazy"
            class="thumbnail-img"
          />

          {#if isVideo(item)}
            <div class="video-indicator">
              <Play size={16} fill="currentColor" />
              {#if item.durationSeconds}
                <span class="duration">{formatDuration(item.durationSeconds)}</span>
              {/if}
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if activeLightboxIndex !== null}
    <Lightbox
      items={items.map((i) => ({
        id: i.id,
        mimeType: i.mimeType,
        originalFilename: i.originalFilename,
        uploaderName: i.uploaderName,
        createdAt: i.createdAt,
        uploaderGuestId: i.uploaderGuestId
      }))}
      initialIndex={activeLightboxIndex}
      canDeleteCurrent={(lightboxItem) => {
        if (!canDelete) return false;
        const orig = items.find((i) => i.id === lightboxItem.id);
        return orig ? canDelete(orig) : false;
      }}
      onClose={closeLightbox}
      onDelete={handleDelete}
    />
  {/if}
</div>

<style>
  .gallery-container {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .media-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px;
  }

  @media (min-width: 640px) {
    .media-grid {
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 12px;
    }
  }

  .grid-item {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: var(--radius-md, 12px);
    overflow: hidden;
    background: var(--color-bg-secondary, #e5e5ea);
    border: none;
    padding: 0;
    cursor: pointer;
    transition: transform 0.15s ease, filter 0.15s ease;
  }

  .grid-item:hover {
    transform: scale(1.02);
    filter: brightness(0.95);
  }

  .grid-item:active {
    transform: scale(0.98);
  }

  .thumbnail-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .video-indicator {
    position: absolute;
    bottom: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #ffffff;
    border-radius: 20px;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .empty-gallery {
    padding: 48px 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--color-surface);
    border-radius: var(--radius-lg, 16px);
    border: 1px solid var(--color-border);
  }

  .empty-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--color-bg-secondary, #f2f2f7);
    color: var(--color-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }

  .empty-gallery h3 {
    margin: 0 0 6px 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .empty-gallery p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    max-width: 300px;
  }
</style>
