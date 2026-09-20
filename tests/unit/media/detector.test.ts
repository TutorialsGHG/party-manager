import { describe, it, expect } from 'vitest';
import { detectMagicBytes } from '../../../src/lib/server/media/detector.js';

describe('Magic Byte Detector', () => {
  it('correctly identifies JPEG files', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const detected = detectMagicBytes(jpegHeader);
    expect(detected).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
      type: 'image'
    });
  });

  it('correctly identifies PNG files', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const detected = detectMagicBytes(pngHeader);
    expect(detected).toEqual({
      mimeType: 'image/png',
      extension: 'png',
      type: 'image'
    });
  });

  it('correctly identifies WebP files', () => {
    const webpHeader = Buffer.from('RIFF....WEBPVP8 ', 'ascii');
    const detected = detectMagicBytes(webpHeader);
    expect(detected).toEqual({
      mimeType: 'image/webp',
      extension: 'webp',
      type: 'image'
    });
  });

  it('correctly identifies HEIC files', () => {
    const heicHeader = Buffer.from([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x68, 0x65, 0x69, 0x63, // 'heic'
      0x00, 0x00, 0x00, 0x00
    ]);
    const detected = detectMagicBytes(heicHeader);
    expect(detected).toEqual({
      mimeType: 'image/heic',
      extension: 'heic',
      type: 'image'
    });
  });

  it('correctly identifies MP4 files', () => {
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x20,
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x69, 0x73, 0x6f, 0x6d, // 'isom'
      0x00, 0x00, 0x02, 0x00
    ]);
    const detected = detectMagicBytes(mp4Header);
    expect(detected).toEqual({
      mimeType: 'video/mp4',
      extension: 'mp4',
      type: 'video'
    });
  });

  it('correctly identifies WebM files', () => {
    const webmHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]);
    const detected = detectMagicBytes(webmHeader);
    expect(detected).toEqual({
      mimeType: 'video/webm',
      extension: 'webm',
      type: 'video'
    });
  });

  it('rejects random binary slop / HTML / text disguised as images', () => {
    const htmlHeader = Buffer.from('<!DOCTYPE html><html>', 'utf8');
    expect(detectMagicBytes(htmlHeader)).toBeNull();

    const shortBuffer = Buffer.from([0x01, 0x02]);
    expect(detectMagicBytes(shortBuffer)).toBeNull();
  });
});
