/**
 * Color palette and dynamic WCAG AA contrast token generator.
 * Enforces accessible contrast ratio (at least 4.5:1 for body, 3:1 for large text/UI).
 */

export interface ColorScheme {
  accent: string;
  accentHover: string;
  accentActive: string;
  accentContrast: string; // #ffffff or #000000 ensuring >= 4.5:1 contrast
  accentSubtle: string;   // 10-15% tint for backgrounds
  accentBorder: string;
}

export const PRESET_ACCENT_COLORS = [
  { id: 'classic-blue', hex: '#007AFF', nameDe: 'Klassisches Blau', nameEn: 'Classic Blue' },
  { id: 'indigo', hex: '#5856D6', nameDe: 'Nacht-Indigo', nameEn: 'Night Indigo' },
  { id: 'purple', hex: '#AF52DE', nameDe: 'Edles Violett', nameEn: 'Noble Violet' },
  { id: 'rose', hex: '#FF2D55', nameDe: 'Warmes Rosé', nameEn: 'Warm Rose' },
  { id: 'ruby', hex: '#FF3B30', nameDe: 'Rubinrot', nameEn: 'Ruby Red' },
  { id: 'sunset', hex: '#FF9500', nameDe: 'Sonnenuntergang', nameEn: 'Sunset Orange' },
  { id: 'amber', hex: '#FFCC00', nameDe: 'Bernstein', nameEn: 'Amber' },
  { id: 'emerald', hex: '#34C759', nameDe: 'Smaragdgrün', nameEn: 'Emerald Green' },
  { id: 'teal', hex: '#30B0C7', nameDe: 'Tiefes Petrol', nameEn: 'Deep Teal' },
  { id: 'graphite', hex: '#8E8E93', nameDe: 'Minimales Graphit', nameEn: 'Minimal Graphite' }
] as const;

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

export function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Derives accessible UI tokens from a hex color.
 * Automatically chooses white or black text to guarantee WCAG AA contrast.
 */
export function deriveThemeTokens(baseHex: string, isDark = false): ColorScheme {
  let hex = baseHex.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    hex = PRESET_ACCENT_COLORS[0].hex;
  }

  const contrastWithWhite = getContrastRatio(hex, '#FFFFFF');
  const contrastWithBlack = getContrastRatio(hex, '#000000');

  // Must have at least 4.5:1 on the button/accent element
  const accentContrast = contrastWithWhite >= 4.5 ? '#FFFFFF' : '#000000';

  const rgb = hexToRgb(hex);

  // Subtle background tint (e.g. active tabs, selected states)
  const subtleAlpha = isDark ? 0.2 : 0.12;
  const borderAlpha = isDark ? 0.35 : 0.25;

  const accentSubtle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${subtleAlpha})`;
  const accentBorder = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${borderAlpha})`;

  // Hover and active states
  const accentHover = isDark
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`
    : `rgba(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)}, 1)`;
  const accentActive = isDark
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`
    : `rgba(${Math.max(0, rgb.r - 35)}, ${Math.max(0, rgb.g - 35)}, ${Math.max(0, rgb.b - 35)}, 1)`;

  return {
    accent: hex,
    accentHover,
    accentActive,
    accentContrast,
    accentSubtle,
    accentBorder
  };
}