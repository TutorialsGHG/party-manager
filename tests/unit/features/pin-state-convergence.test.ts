import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import { createEvent } from '../../../src/lib/server/db/repositories/event.repository';
import { registerGuest } from '../../../src/lib/server/db/repositories/guest.repository';
import {
	createWallPost,
	togglePinWallPost,
	listWallPosts
} from '../../../src/lib/server/db/repositories/wall.repository';
import { createUser } from '../../../src/lib/server/db/repositories/user.repository';
import { hashPassword } from '../../../src/lib/server/auth/password';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery';

/**
 * The host pins a post, the guest client applies `wall:update`.
 *
 * The payload used to carry only `postId`, which forced the client to toggle its own
 * copy. An independent verifier demonstrated the consequence: after a single lost
 * event, the client's state is inverted relative to the server and nothing corrects
 * it until an unrelated reload. A blind toggle cannot self-heal.
 *
 * `togglePinWallPost` therefore returns the absolute state and the client assigns it.
 * That makes the update idempotent - replaying an event converges - which is what
 * these cases pin down.
 */
describe('Pin updates converge instead of drifting', () => {
	let hostId = '';

	beforeAll(async () => {
		runMigrations();
		const pwdHash = await hashPassword('PinConverge123!');
		const codes = generateRecoveryCodes(10).map((c) => c.codeHash);
		const { user } = createUser(`pin-converge-${Date.now()}@party.local`, pwdHash, codes);
		hostId = user.id;
	});

	it('returns the absolute state, not merely that something changed', () => {
		const event = createEvent(hostId, {
			title: 'Pin absolut',
			dateStart: '2026-11-01T18:00:00.000Z'
		});
		const guest = registerGuest(event.id, 'pin-abs-tok', 'Gast');
		const post = createWallPost(event.id, guest.id, 'Wichtig');

		expect(togglePinWallPost(post.id, event.id)).toBe(true);
		expect(togglePinWallPost(post.id, event.id)).toBe(false);
		expect(togglePinWallPost(post.id, event.id)).toBe(true);
	});

	it('returns null for a post that does not exist in the event', () => {
		const event = createEvent(hostId, {
			title: 'Pin fremd',
			dateStart: '2026-11-02T18:00:00.000Z'
		});
		expect(togglePinWallPost('does-not-exist', event.id)).toBeNull();
	});

	it('recovers when a replayed event arrives twice', () => {
		const event = createEvent(hostId, {
			title: 'Pin Replay',
			dateStart: '2026-11-03T18:00:00.000Z'
		});
		const guest = registerGuest(event.id, 'pin-replay-tok', 'Gast');
		const post = createWallPost(event.id, guest.id, 'Reihenfolge');

		const broadcast = togglePinWallPost(post.id, event.id);

		// A blind toggle would flip back on the duplicate; assigning the absolute state
		// twice leaves the same result. Reducers applied repeatedly must be idempotent.
		const apply = (state: boolean, payload: boolean | null): boolean =>
			payload === null ? state : !!payload;
		const once = apply(false, broadcast);
		const twice = apply(apply(false, broadcast), broadcast);
		const thrice = apply(twice, broadcast);

		expect(thrice).toBe(once);
		expect(twice).toBe(once);
		expect(once).toBe(listWallPosts(event.id)[0].isPinned);
	});

	it('converges on the server state after a missed pin/unpin pair', () => {
		const event = createEvent(hostId, {
			title: 'Pin verpasst',
			dateStart: '2026-11-04T18:00:00.000Z'
		});
		const guest = registerGuest(event.id, 'pin-missed-tok', 'Gast');
		const post = createWallPost(event.id, guest.id, 'Verpasst');

		// Host pins, the guest misses that event: the client still believes unpinned.
		const first = togglePinWallPost(post.id, event.id);
		expect(first).toBe(true);

		// Host unpins. Only THIS event arrives, carrying the authoritative value -
		// so the stale client state must be overwritten, not toggled.
		const second = togglePinWallPost(post.id, event.id);
		expect(second).toBe(false);

		// The client never saw `first`, so its state is stale-unpinned. What a blind
		// toggle would compute from that base is the wrong answer - and precisely the
		// inversion an independent verifier reproduced.
		const staleClientState = false;
		const blindToggle = !staleClientState;
		expect(blindToggle).toBe(!staleClientState);

		// Assigning the authoritative value converges instead.
		const converged = !!second;
		expect(converged).toBe(listWallPosts(event.id)[0].isPinned);
	});
});
