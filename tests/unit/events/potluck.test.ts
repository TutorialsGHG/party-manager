import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import {
	createEvent,
	findEventById,
	updatePlaylistUrl
} from '../../../src/lib/server/db/repositories/event.repository';
import {
	createPotluckItem,
	listPotluckItems,
	claimPotluckItem,
	unclaimPotluckItem,
	deletePotluckItem
} from '../../../src/lib/server/db/repositories/potluck.repository';
import { registerGuest } from '../../../src/lib/server/db/repositories/guest.repository';
import { createUser } from '../../../src/lib/server/db/repositories/user.repository';
import { hashPassword } from '../../../src/lib/server/auth/password';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery';
import { getDb } from '../../../src/lib/server/db/client';

describe('Potluck & Playlist Modules', () => {
	let hostId = '';
	let eventId = '';
	let guestAId = '';
	let guestBId = '';

	beforeAll(async () => {
		runMigrations();
		const pwdHash = await hashPassword('HostPassword123!');
		const codes = generateRecoveryCodes(10).map((c) => c.codeHash);
		const { user } = createUser(`potluckhost-${Date.now()}@party.local`, pwdHash, codes);
		hostId = user.id;

		const event = createEvent(hostId, {
			title: 'Party with Potluck',
			dateStart: '2026-08-10T18:00:00.000Z',
			playlistUrl: 'https://music.youtube.com/playlist?list=PLTEST123'
		});
		eventId = event.id;

		const gA = registerGuest(eventId, 'device-potluck-a', 'Alex Tester');
		guestAId = gA.id;
		const gB = registerGuest(eventId, 'device-potluck-b', 'Ben Tester');
		guestBId = gB.id;
	});

	it('creates and hydrates playlistUrl with encryption', () => {
		const event = findEventById(eventId, hostId);
		expect(event).not.toBeNull();
		expect(event!.playlistUrl).toBe('https://music.youtube.com/playlist?list=PLTEST123');

		// Check raw DB row to ensure it is encrypted (not plaintext)
		const row = getDb()
			.prepare('SELECT playlist_url_cipher FROM events WHERE id = ?')
			.get(eventId) as { playlist_url_cipher: string };
		expect(row.playlist_url_cipher).toBeDefined();
		expect(row.playlist_url_cipher).not.toBe('https://music.youtube.com/playlist?list=PLTEST123');

		// Update playlist URL
		updatePlaylistUrl(eventId, hostId, 'https://music.youtube.com/playlist?list=PLNEW456');
		const updated = findEventById(eventId, hostId);
		expect(updated!.playlistUrl).toBe('https://music.youtube.com/playlist?list=PLNEW456');
	});

	it('creates potluck items with encrypted titles', () => {
		const item = createPotluckItem(eventId, 'Baguette & Dips', guestAId);
		expect(item.id).toBeDefined();
		expect(item.title).toBe('Baguette & Dips');
		expect(item.claimedByGuestId).toBeNull();

		// Verify encrypted in database
		const raw = getDb()
			.prepare('SELECT title_cipher FROM potluck_items WHERE id = ?')
			.get(item.id) as { title_cipher: string };
		expect(raw.title_cipher).toBeDefined();
		expect(raw.title_cipher).not.toContain('Baguette');

		const list = listPotluckItems(eventId);
		expect(list.some((i) => i.title === 'Baguette & Dips')).toBe(true);
	});

	it('allows a guest to claim and unclaim a potluck item', () => {
		const item = createPotluckItem(eventId, 'Kasten Bier', null);

		// Guest A claims it
		const claimed = claimPotluckItem(eventId, item.id, guestAId, 'Alex Tester');
		expect(claimed).not.toBeNull();
		expect(claimed!.claimedByGuestId).toBe(guestAId);
		expect(claimed!.claimedByName).toBe('Alex Tester');

		// Guest B tries to claim already claimed item -> should fail
		const stolen = claimPotluckItem(eventId, item.id, guestBId, 'Ben Tester');
		expect(stolen).toBeNull();

		// Guest B tries to unclaim Guest A's item -> should fail
		const unclaimFail = unclaimPotluckItem(eventId, item.id, guestBId, false);
		expect(unclaimFail).toBeNull();

		// Guest A unclaims own item -> should succeed
		const unclaimSuccess = unclaimPotluckItem(eventId, item.id, guestAId, false);
		expect(unclaimSuccess).not.toBeNull();
		expect(unclaimSuccess!.claimedByGuestId).toBeNull();
	});

	it('allows the host to unclaim and delete any item', () => {
		const item = createPotluckItem(eventId, 'Eiswürfel', guestAId);
		claimPotluckItem(eventId, item.id, guestBId, 'Ben Tester');

		// Host can unclaim any item
		const hostUnclaim = unclaimPotluckItem(eventId, item.id, null, true);
		expect(hostUnclaim).not.toBeNull();
		expect(hostUnclaim!.claimedByGuestId).toBeNull();

		// Other guest cannot delete
		const delFail = deletePotluckItem(eventId, item.id, guestBId, false);
		expect(delFail).toBe(false);

		// Host can delete
		const delSuccess = deletePotluckItem(eventId, item.id, null, true);
		expect(delSuccess).toBe(true);

		const remaining = listPotluckItems(eventId);
		expect(remaining.some((i) => i.id === item.id)).toBe(false);
	});
});
