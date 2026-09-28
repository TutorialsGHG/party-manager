import { describe, it, expect } from 'vitest';
import { setLocale, t, formatDate } from '../../src/lib/i18n';

describe('i18n Engine', () => {
	it('should translate keys correctly in German', () => {
		setLocale('de');
		expect(t('app.name')).toBe('Einladung');
		expect(t('rsvp.yes')).toBe('Ich bin dabei');
	});

	it('should translate keys correctly in English', () => {
		setLocale('en');
		expect(t('app.name')).toBe('Einladung');
		expect(t('rsvp.yes')).toBe('I am attending');
	});

	it('should format dates properly according to locale', () => {
		setLocale('de');
		const d = new Date('2026-10-15T18:00:00Z');
		const formattedDe = formatDate(d, { month: 'long', year: 'numeric' });
		expect(formattedDe.toLowerCase()).toContain('oktober');

		setLocale('en');
		const formattedEn = formatDate(d, { month: 'long', year: 'numeric' });
		expect(formattedEn.toLowerCase()).toContain('october');
	});
});
