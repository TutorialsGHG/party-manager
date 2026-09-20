import { processMedia } from './processor.js';
import { MediaRepository } from '$lib/server/db/media.repository.js';

class MediaQueue {
  private queue: string[] = [];
  private isProcessing = false;

  public enqueue(mediaId: string): void {
    if (!this.queue.includes(mediaId)) {
      this.queue.push(mediaId);
      MediaRepository.updateStatus(mediaId, 'queued');
    }
    this.processNext();
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public isBusy(): boolean {
    return this.isProcessing;
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const mediaId = this.queue.shift()!;

    try {
      await processMedia(mediaId);
    } catch (err) {
      console.error(`Media queue job failed for ${mediaId}:`, err);
    } finally {
      this.isProcessing = false;
      // Continue with remaining jobs in background
      queueMicrotask(() => {
        this.processNext();
      });
    }
  }
}

export const mediaQueue = new MediaQueue();
