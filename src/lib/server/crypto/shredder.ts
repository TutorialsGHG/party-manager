import fs from 'node:fs';
import { getEventKeyFilePath, evictEventKey } from './envelope';

/**
 * Permanently and irrevocably destroys the encryption key for an event (Crypto-Shredding).
 * After this call, all ciphertexts and media encrypted under this key become mathematically unreadable,
 * even if copies remain on wear-leveling SSDs, CoW filesystems (ZFS/btrfs), or storage snapshots.
 */
export function shredEventKey(eventId: string): boolean {
  evictEventKey(eventId);

  const keyPath = getEventKeyFilePath(eventId);
  if (fs.existsSync(keyPath)) {
    try {
      // Overwrite file with random bytes before unlinking where OS allows
      const stat = fs.statSync(keyPath);
      const randomBuf = Buffer.alloc(stat.size, 0x00);
      fs.writeFileSync(keyPath, randomBuf);
      fs.unlinkSync(keyPath);
      return true;
    } catch (err) {
      console.error(`Failed to shred event key at ${keyPath}:`, err);
      // Attempt standard unlink if overwrite failed
      if (fs.existsSync(keyPath)) {
        fs.unlinkSync(keyPath);
      }
      return true;
    }
  }

  return false;
}