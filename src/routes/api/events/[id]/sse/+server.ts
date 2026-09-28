import type { RequestHandler } from '@sveltejs/kit';
import { sseHub } from '$lib/server/realtime/sse-hub';
import { findEventById } from '$lib/server/db/repositories/event.repository';

export const GET: RequestHandler = async ({ params }) => {
	const eventId = params.id!;
	const event = findEventById(eventId);
	if (!event) {
		return new Response('Event not found', { status: 404 });
	}

	let cleanup: (() => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			cleanup = sseHub.addClient(eventId, controller);

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
