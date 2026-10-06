import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The guest page subscribes to SSE events in one onMount block. A missing subscription
 * is invisible at runtime: the page still renders correctly, the guest simply keeps a
 * stale state until a full reload. That is exactly why the host's "pin" action
 * (which broadcasts `wall:update`) went unnoticed while `wall:new` and `wall:delete`
 * worked fine.
 *
 * SCOPE, learned from an independent review that failed this test in its first
 * version: broadcasts are scattered across five files, and the previous version
 * scanned only one of them. Injecting `wall:archive` into
 * src/routes/e/[token]/+page.server.ts - which also broadcasts wall events - left
 * that test at 4/4 green. So this scans the whole src tree.
 *
 * This remains a source-level contract check, not a behavioural one: it cannot catch a
 * broadcast built by a renamed helper or an aliased constant. It does catch the case
 * that actually bit us - a new wall event added to a file this test never looked at.
 */
const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const SRC = path.join(REPO_ROOT, 'src');

function allSourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			out.push(...allSourceFiles(full));
		} else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) {
			out.push(full);
		}
	}
	return out;
}

/** Every `sseHub.broadcast(<anything>, '<name>'` in the whole src tree. */
function collectBroadcasts(): Map<string, string[]> {
	const found = new Map<string, string[]>();
	for (const file of allSourceFiles(SRC)) {
		const source = readFileSync(file, 'utf8');
		for (const match of source.matchAll(/sseHub\.broadcast\(\s*[^,]+,\s*'([^']+)'/g)) {
			const list = found.get(match[1]) ?? [];
			list.push(path.relative(REPO_ROOT, file));
			found.set(match[1], list);
		}
	}
	return found;
}

function guestSubscriptions(): string[] {
	const guestPage = readFileSync(path.join(SRC, 'routes', 'e', '[token]', '+page.svelte'), 'utf8');
	return [...guestPage.matchAll(/addEventListener\(\s*'([^']+)'/g)].map((m) => m[1]);
}

describe('Wall SSE: the guest subscribes to every wall event the host broadcasts', () => {
	const broadcasts = collectBroadcasts();
	const subscribed = guestSubscriptions();

	it('finds wall broadcasts across the whole source tree', () => {
		// Guards the scan itself: if the walk silently matched nothing, every other
		// assertion here would pass vacuously.
		expect(broadcasts.size).toBeGreaterThan(4);
		expect(broadcasts.get('wall:new')?.length).toBeGreaterThanOrEqual(2);
		expect(broadcasts.has('wall:update')).toBe(true);
		expect(broadcasts.has('wall:delete')).toBe(true);
	});

	it('subscribes to every wall event broadcast anywhere in src', () => {
		const wallEvents = [...broadcasts.keys()].filter((name) => name.startsWith('wall:'));
		const missing = wallEvents.filter((name) => !subscribed.includes(name));
		expect(missing).toEqual([]);
	});

	it('subscribes to every non-wall event broadcast anywhere in src', () => {
		// Not just the wall: the same trap applies to rsvp, poll and media events.
		const missing = [...broadcasts.keys()].filter((name) => !subscribed.includes(name));
		expect(missing).toEqual([]);
	});

	it('cleans up the EventSource on unmount', () => {
		const guestPage = readFileSync(
			path.join(SRC, 'routes', 'e', '[token]', '+page.svelte'),
			'utf8'
		);
		const onMountBody = guestPage.slice(guestPage.indexOf('onMount(() =>'));
		expect(onMountBody).toContain('eventSource.close()');
	});
});
