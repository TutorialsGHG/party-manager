import de from './de.json';
import en from './en.json';

export type Locale = 'de' | 'en';

export const translations = {
  de,
  en
} as const;

let activeLocale: Locale = 'de';
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return activeLocale;
}

export function setLocale(locale: Locale) {
  activeLocale = locale;
  if (typeof window !== 'undefined') {
    localStorage.setItem('app_locale', locale);
    document.documentElement.lang = locale;
  }
  listeners.forEach(fn => fn(locale));
}

export function subscribeLocale(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  fn(activeLocale);
  return () => listeners.delete(fn);
}

export function t(path: string, params?: Record<string, string | number>, locale?: Locale): string {
  const loc = locale || activeLocale;
  const keys = path.split('.');
  let current: any = translations[loc];

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      current = undefined;
      break;
    }
  }

  if (current === undefined) {
    let fallback: any = translations.de;
    for (const key of keys) {
      if (fallback && typeof fallback === 'object' && key in fallback) {
        fallback = fallback[key];
      } else {
        return path;
      }
    }
    current = fallback;
  }

  if (typeof current !== 'string') {
    return path;
  }

  if (params) {
    let result = current;
    for (const [k, v] of Object.entries(params)) {
      result = result.replaceAll(`{${k}}`, String(v));
    }
    return result;
  }

  return current;
}

export function formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions, locale?: Locale): string {
  const d = typeof date === 'object' ? date : new Date(date);
  return new Intl.DateTimeFormat(locale || activeLocale, options ?? {
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(d);
}

export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, locale?: Locale): string {
  return new Intl.RelativeTimeFormat(locale || activeLocale, { numeric: 'auto' }).format(value, unit);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions, locale?: Locale): string {
  return new Intl.NumberFormat(locale || activeLocale, options).format(value);
}