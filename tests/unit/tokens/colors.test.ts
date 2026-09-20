import { describe, it, expect } from 'vitest';
import { deriveThemeTokens, PRESET_ACCENT_COLORS, getContrastRatio } from '../../../src/lib/ui/tokens/colors';

describe('Color Contrast and Token Generation', () => {
  it('should guarantee WCAG AA contrast for all preset colors', () => {
    for (const preset of PRESET_ACCENT_COLORS) {
      const tokens = deriveThemeTokens(preset.hex);
      const ratio = getContrastRatio(tokens.accent, tokens.accentContrast);
      // WCAG AA for normal text requires at least 4.5:1
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('should fall back to safe default if invalid hex is provided', () => {
    const tokens = deriveThemeTokens('invalid-color');
    expect(tokens.accent).toBe('#007AFF');
    const ratio = getContrastRatio(tokens.accent, tokens.accentContrast);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});