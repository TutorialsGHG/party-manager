import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import AnnouncementProbe from './zz-announcement-render.svelte';

/**
 * Renders the announcement markup through the REAL Svelte compiler and inspects the
 * emitted HTML.
 *
 * A `{value}` interpolation is escaped by Svelte, but "Svelte escapes" is a claim
 * about the framework, not evidence about this template. An independent verifier
 * tried to check the XSS surface of the announcement and its probe never ran, so the
 * question was left open. This closes it by execution.
 */
describe('Announcement content is rendered as text, not markup', () => {
	it('escapes a script payload', () => {
		const payload = `<script>alert('xss')</script>`;
		const { body } = render(AnnouncementProbe, { props: { content: payload } });

		// Observed output: <p>&lt;script>alert('xss')&lt;/script></p>
		//
		// Svelte escapes the opening angle bracket but not the `>`, so the raw text
		// is not byte-identical to the input. What matters is that no script ELEMENT
		// is produced: a parser never sees `<script`, because that byte sequence does
		// not occur in the output.
		expect(body).not.toContain('<script');
		expect(body).not.toContain('</script');
		expect(body).toContain('&lt;script');
	});

	it('escapes an image onerror payload', () => {
		const payload = `<img src=x onerror="alert(1)">`;
		const { body } = render(AnnouncementProbe, { props: { content: payload } });

		expect(body).not.toMatch(/<img src=x onerror/i);
		expect(body).toContain('&lt;img');
	});

	it('keeps ampersands and quotes inert', () => {
		const payload = `Tom & Jerry's "party" <b>bold</b>`;
		const { body } = render(AnnouncementProbe, { props: { content: payload } });

		expect(body).not.toMatch(/<b>bold<\/b>/);
		expect(body).toContain('&amp;');
	});

	it('renders ordinary text unchanged', () => {
		const { body } = render(AnnouncementProbe, {
			props: { content: 'Bitte Getränke bis Freitag mitbringen' }
		});
		expect(body).toContain('Bitte Getränke bis Freitag mitbringen');
	});
});
