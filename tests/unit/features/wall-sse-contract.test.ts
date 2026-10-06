import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The guest page subscribes to SSE events inside a single onMount block. A missing
 * subscription is invisible at runtime: the page still renders correctly, the guest
 * simply keeps a stale state until a full reload. That is precisely why the host's
 * "pin" action (which broadcasts `wall:update`) went unnoticed while `wall:new` and
 * `wall:delete` worked fine.
 *
 * This test pins the subscription list against what the server actually broadcasts,
 * so adding a new broadcast without a matching listener fails CI.
 */
const GUEST_PAGE = fileURLToPath(
	new URL('../../../src/routes/e/[token]/+page.svelte', import.meta.url)
);
const HOST_PAGE_SERVER = fileURLToPath(
	new URL('../../../src/routes/(app)/events/[id]/+page.server.ts', import.meta.url)
);

function read(path: string): string {
	return readFileSync(path, 'utf8');
}

describe('Wall SSE: guest subscribes to everything the host broadcasts', () => {
	const guestPage = read(GUEST_PAGE);
	const hostServer = read(HOST_PAGE_SERVER);

	const broadcastEvents = [...hostServer.matchAll(/sseHub\.broadcast\([^,]+,\s*'([^']+)'/g)]
		.map((m) => m[1])
		.filter((name) => name.startsWith('wall:'));

	const subscribedEvents = [...guestPage.matchAll(/addEventListener\(\s*'([^']+)'/g)].map(
		(m) => m[1]
	);

	it('finds the wall broadcasts on the host side', () => {
		expect(broadcastEvents).toContain('wall:new');
		expect(broadcastEvents).toContain('wall:update');
		expect(broadcastEvents).toContain('wall:delete');
	});

	it('subscribes to every wall event the host broadcasts', () => {
		const missing = broadcastEvents.filter((name) => !subscribedEvents.includes(name));
		expect(missing).toEqual([]);
	});

	it('cleans up the EventSource on unmount', () => {
		// Otherwise the stream leaks per navigation, and with it the pin updates.
		const onMountBody = guestPage.slice(guestPage.indexOf('onMount(() =>'));
		expect(onMountBody).toContain('eventSource.close()');
	});

	it('re-sorts pinned posts to the top, matching the repository order', () => {
		// listWallPosts() orders by is_pinned DESC, created_at DESC. The local
		// re-sort after a pin toggle has to reproduce that, otherwise a pin would
		// jump the post somewhere the full reload would contradict.
		expect(onMountBodyOf(guestPage)).toContain('a.isPinned ? -1 : 1');
		expect(onMountBodyOf(guestPage)).toContain('b.createdAt - a.createdAt');
	});
});

function onMountBodyOf(source: string): string {
	const start = source.indexOf('onMount(() =>');
	return start === -1 ? '' : source.slice(start);
}
