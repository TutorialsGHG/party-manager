import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import { createEvent } from '../../../src/lib/server/db/repositories/event.repository';
import { registerGuest } from '../../../src/lib/server/db/repositories/guest.repository';
import {
	createWallPost,
	listWallPosts,
	togglePinWallPost,
	deleteWallPost
} from '../../../src/lib/server/db/repositories/wall.repository';
import {
	createPoll,
	addPollOption,
	votePoll,
	listPollsForEvent,
	toggleClosePoll
} from '../../../src/lib/server/db/repositories/poll.repository';
import { sseHub } from '../../../src/lib/server/realtime/sse-hub';
import { createUser } from '../../../src/lib/server/db/repositories/user.repository';
import { hashPassword } from '../../../src/lib/server/auth/password';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery';

describe('Wall Posts, Polls & SSE Realtime', () => {
	let eventId = '';
	let guest1Id = '';
	let guest2Id = '';

	beforeAll(async () => {
		runMigrations();
		const pwdHash = await hashPassword('HostPassword123!');
		const codes = generateRecoveryCodes(10).map((c) => c.codeHash);
		const { user } = createUser(`wallhost-${Date.now()}@party.local`, pwdHash, codes);

		const event = createEvent(user.id, {
			title: 'Wall & Polls Event',
			dateStart: '2026-08-15T18:00:00.000Z'
		});
		eventId = event.id;

		const g1 = registerGuest(eventId, 'tok-wall-1', 'Lukas');
		const g2 = registerGuest(eventId, 'tok-wall-2', 'Elena');
		guest1Id = g1.id;
		guest2Id = g2.id;
	});

	it('should create, list, pin and delete wall posts with encryption', () => {
		// 1. Create post
		const post1 = createWallPost(eventId, guest1Id, 'Freue mich riesig auf die Party!');
		expect(post1.content).toBe('Freue mich riesig auf die Party!');
		expect(post1.authorName).toBe('Lukas');

		const post2 = createWallPost(eventId, guest2Id, 'Bringt jemand Gitarren mit?');
		expect(post2.content).toBe('Bringt jemand Gitarren mit?');

		// 2. List posts
		const posts = listWallPosts(eventId);
		expect(posts.length).toBeGreaterThanOrEqual(2);

		// 3. Pin post 1
		const pinned = togglePinWallPost(post1.id, eventId);
		expect(pinned).toBe(true);

		const postsAfterPin = listWallPosts(eventId);
		expect(postsAfterPin[0].id).toBe(post1.id);
		expect(postsAfterPin[0].isPinned).toBe(true);

		// 4. Delete post (author check)
		const deletedByOther = deleteWallPost(post1.id, eventId, guest2Id); // guest 2 tries to delete guest 1's post
		expect(deletedByOther).toBe(false);

		const deletedByAuthor = deleteWallPost(post1.id, eventId, guest1Id);
		expect(deletedByAuthor).toBe(true);
	});

	it('should create polls, add dynamic options, vote, and tally accurately', () => {
		// 1. Create poll
		const poll = createPoll(eventId, {
			question: 'Welche Musik soll gespielt werden?',
			options: ['Rock & Pop', 'House / Techno', '80s & 90s Hits'],
			isMultiple: true,
			allowGuestOptions: true
		});

		expect(poll.question).toBe('Welche Musik soll gespielt werden?');
		expect(poll.options).toHaveLength(3);

		// 2. Guest adds dynamic option
		const newOpt = addPollOption(poll.id, eventId, 'HipHop Classics', guest1Id);
		expect(newOpt.text).toBe('HipHop Classics');

		// 3. Guest 1 votes for 2 options
		const voted = votePoll(poll.id, guest1Id, [poll.options[0].id, newOpt.id]);
		expect(voted).toBe(true);

		// 4. Guest 2 votes for 1 option
		votePoll(poll.id, guest2Id, [poll.options[0].id]);

		// 5. Check tally
		const polls = listPollsForEvent(eventId, guest1Id);
		const targetPoll = polls.find((p) => p.id === poll.id)!;
		expect(targetPoll.totalVotes).toBe(3); // 2 votes from g1 + 1 vote from g2

		const optRock = targetPoll.options.find((o) => o.text === 'Rock & Pop')!;
		expect(optRock.voteCount).toBe(2);
		expect(optRock.hasVoted).toBe(true); // guest1 voted for this

		const optHipHop = targetPoll.options.find((o) => o.text === 'HipHop Classics')!;
		expect(optHipHop.voteCount).toBe(1);

		// 6. Close poll
		toggleClosePoll(poll.id, eventId);
		const voteOnClosed = votePoll(poll.id, guest1Id, [poll.options[1].id]);
		expect(voteOnClosed).toBe(false); // cannot vote when closed
	});

	it('should manage SSE clients and broadcast events without error', () => {
		const messages: string[] = [];
		const mockController: any = {
			enqueue: (msg: string) => messages.push(msg)
		};

		const unsubscribe = sseHub.addClient(eventId, mockController);
		expect(sseHub.getActiveClientCount(eventId)).toBe(1);

		// Broadcast test message
		sseHub.broadcast(eventId, 'wall:new', { message: 'Hello Live!' });
		expect(messages.length).toBe(1);
		expect(messages[0]).toContain('event: wall:new');
		expect(messages[0]).toContain('Hello Live!');

		// Cleanup
		unsubscribe();
		expect(sseHub.getActiveClientCount(eventId)).toBe(0);
	});
});
