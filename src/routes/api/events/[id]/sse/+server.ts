import type { RequestHandler } from '@sveltejs/kit';
import { sseHub } from '$lib/server/realtime/sse-hub';
import { findEventById } from '$lib/server/db/repositories/event.repository';
import { findGuestByDeviceToken } from '$lib/server/db/repositories/guest.repository';
import { guestSeesAnnouncements } from '$lib/server/announcements/audience';

export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	const eventId = params.id!;
	const cookieName = `dev_tok_${eventId.slice(0, 8)}`;

	// Authorization mirrors the media routes: either the authenticated host who owns
	// the event, or a registered guest of that event. Previously the route only
	// checked that the event existed, so anyone knowing the event UUID could read the
	// full live feed (RSVP changes, wall posts, poll updates, media deletions).
	const isHost = !!locals.user && !!findEventById(eventId, locals.user.id);

	let isGuest = false;
	if (!isHost) {
		const deviceToken = cookies.get(cookieName);
		isGuest = !!deviceToken && !!findGuestByDeviceToken(eventId, deviceToken);
	}

	if (!isHost && !isGuest) {
		return new Response('Unauthorized', { status: 401 });
	}

	// The hub enforces a per-room and a global connection cap (DYN-04).
	if (!sseHub.canAcceptClient(eventId)) {
		return new Response('Too many connections', {
			status: 503,
			headers: { 'Retry-After': '30' }
		});
	}

	let cleanup: (() => void) | null = null;

	// Announcements are addressed to the guests who confirmed. The initial page load
	// filters them server-side, but this stream is long-lived: without a per-connection
	// check, a guest who declined would still receive every announcement as it is sent.
	//
	// The predicate is the SAME function the page load uses
	// (lib/server/announcements/audience.ts). Sharing it is the point: the two used to
	// disagree, which is how the plaintext ended up on a channel the filter was supposed
	// to protect. Resolved once per connection - an RSVP cannot change while the socket
	// is open, and a per-broadcast database read would tax every live client.
	const canReceive = (eventType: string): boolean => {
		if (!eventType.startsWith('announcement:')) return true;
		if (isHost) return true;

		const cookie = cookies.get(cookieName);
		if (!cookie) return false;
		return guestSeesAnnouncements(eventId, findGuestByDeviceToken(eventId, cookie));
	};

	const stream = new ReadableStream({
		start(controller) {
			cleanup = sseHub.addClient(eventId, controller, canReceive);

			if (!cleanup) {
				controller.enqueue(`event: error\ndata: {"reason":"capacity"}\n\n`);
				controller.close();
				return;
			}

			// Send initial connection greeting
			controller.enqueue(`event: connected\ndata: {"eventId":"${eventId}"}\n\n`);

			// 25s keepalive comment to prevent reverse proxies from dropping idle connections
			const keepAliveTimer = setInterval(() => {
				try {
					controller.enqueue(': keepalive\n\n');
				} catch {
					clearInterval(keepAliveTimer);
				}
			}, 25000);

			// Store timer on cleanup
			const originalCleanup = cleanup;
			cleanup = () => {
				clearInterval(keepAliveTimer);
				originalCleanup();
			};
		},
		cancel() {
			cleanup?.();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no' // Instruct Nginx not to buffer SSE
		}
	});
};
