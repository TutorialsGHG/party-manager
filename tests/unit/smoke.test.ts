import { describe, it, expect } from 'vitest';
import { APP_NAME } from '../../src/lib/config';

describe('Smoke Test', () => {
  it('should have the correct configurable APP_NAME', () => {
    expect(APP_NAME).toBe('Einladung');
  });
});