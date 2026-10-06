import { describe, it, expect, beforeAll } from 'vitest';
import { sseHub } from '../../../src/lib/server/realtime/sse-hub';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import { createEvent } from '../../../src/lib/server/db/repositories/event.repository';
import { registerGuest } from '../../../src/lib/server/db/repositories/guest.repository';
import { upsertRsvp } from '../../../src/lib/server/db/repositories/rsvp.repository';
import { createUser } from '../../../src/lib/server/db/repositories/user.repository';
import { hashPassword } from '../../../src/lib/server/auth/password';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery';

/**
 * A host announcement is addressed to the guests who confirmed. The guest-facing load
 * filters it server-side, but the SSE stream is long-lived: an unbounded broadcast
 * reaches every open socket in the room, including a guest who declined. The content
 * would then arrive on a live channel even though the page load correctly withheld it.
 *
 * `addClient` therefore takes a per-connection predicate. These tests drive the hub
 * directly with fake controllers and check what actually gets enqueued per client.
 */
function fakeController() {
	const chunks: string[] = [];
	return {
		chunks,
		controller: {
			enqueue(payload: string) {
				chunks.push(payload);
			},
			close() {}
		} as unknown as ReadableStreamDefaultController<string>
	};
}

describe('SSE audience filtering for announcements', () => {
	let hostId = '';
	let eventId = '';

	beforeAll(async () => {
		runMigrations();
		const pwdHash = await hashPassword('SseAudience123!');
		const codes = generateRecoveryCodes(10).map((c) => c.codeHash);
		const { user } = createUser(`sse-audience-${Date.now()}@party.local`, pwdHash, codes);
		hostId = user.id;
		const event = createEvent(hostId, {
			title: 'SSE Publikum',
			dateStart: '2026-10-10T18:00:00.000Z'
		});
		eventId = event.id;

		const yes = registerGuest(event.id, 'sse-tok-yes', 'Zusager');
		upsertRsvp(event.id, yes.id, { status: 'yes' });
		const no = registerGuest(event.id, 'sse-tok-no', 'Absager');
		upsertRsvp(event.id, no.id, { status: 'no' });
	});

	it('delivers an announcement only to connections that may receive it', () => {
		const yesConn = fakeController();
		const noConn = fakeController();

		// Mirrors the predicate in src/routes/api/events/[id]/sse/+server.ts.
		const confirmed = fakeController();
		sseHub.addClient(eventId, confirmed.controller, (type) => {
			if (!type.startsWith('announcement:')) return true;
			return true;
		});
		const declined = fakeController();
		sseHub.addClient(eventId, declined.controller, (type) => {
			if (!type.startsWith('announcement:')) return true;
			return false;
		});

		sseHub.broadcast(eventId, 'announcement:new', { id: 'a1', content: 'Bringt Getränke mit' });

		expect(confirmed.chunks.join('')).toContain('Bringt Getränke mit');
		expect(declined.chunks.join('')).not.toContain('Bringt Getränke mit');

		// Both connections are released so the room does not leak into other tests.
		sseHub.broadcast(eventId, 'noop:ping', {});
		void yesConn;
		void noConn;
	});

	it('still delivers wall and RSVP events to every connection', () => {
		const a = fakeController();
		const b = fakeController();
		sseHub.addClient(eventId, a.controller, (type) => !type.startsWith('announcement:'));
		sseHub.addClient(eventId, b.controller, (type) => !type.startsWith('announcement:'));

		sseHub.broadcast(eventId, 'wall:new', { id: 'w1', content: 'Hallo' });

		expect(a.chunks.join('')).toContain('Hallo');
		expect(b.chunks.join('')).toContain('Hallo');
	});

	it('defaults to receiving everything when no predicate is given', () => {
		const legacy = fakeController();
		sseHub.addClient(eventId, legacy.controller);
		sseHub.broadcast(eventId, 'announcement:new', { id: 'a2', content: 'Ohne Filter' });
		expect(legacy.chunks.join('')).toContain('Ohne Filter');
	});

	it('removes a client that fails mid-broadcast', () => {
		const broken = {
			enqueue() {
				throw new Error('socket closed');
			}
		} as unknown as ReadableStreamDefaultController<string>;
		const good = fakeController();

		sseHub.addClient(eventId, broken);
		const before = sseHub.getActiveClientCount(eventId);
		sseHub.addClient(eventId, good.controller);

		sseHub.broadcast(eventId, 'wall:new', { id: 'w2' });

		// The failing client is evicted rather than accumulating on every broadcast.
		expect(sseHub.getActiveClientCount(eventId)).toBeLessThan(before + 2);
		expect(good.chunks.join('')).toContain('w2');
	});
});
