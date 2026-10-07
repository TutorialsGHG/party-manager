type SSEController = ReadableStreamDefaultController<string>;

interface ClientConnection {
	id: string;
	controller: SSEController;
	/**
	 * Guests only receive the broadcasts they are entitled to. A plain `broadcast`
	 * reaches everyone in the room, which is right for the wall but wrong for host
	 * announcements: those are addressed to the guests who confirmed, and a guest who
	 * declined must not receive the content on a live channel either - the server-side
	 * filter in the guest load only covers the initial page load.
	 */
	canReceive(targetEventType: string): boolean;
}

/** Per-event connection cap: one guest can otherwise open unlimited EventSource connections. */
const MAX_CLIENTS_PER_ROOM = 200;
/** Global cap across all rooms, as a second stage for a small self-hosted VPS. */
const MAX_CLIENTS_GLOBAL = 500;

class SSEHub {
	private eventRooms = new Map<string, Set<ClientConnection>>();

	get totalClientCount(): number {
		let total = 0;
		for (const room of this.eventRooms.values()) {
			total += room.size;
		}
		return total;
	}

	/**
	 * Whether another connection would be accepted right now, without registering it.
	 */
	canAcceptClient(eventId: string): boolean {
		if (this.totalClientCount >= MAX_CLIENTS_GLOBAL) return false;
		const room = this.eventRooms.get(eventId);
		return !room || room.size < MAX_CLIENTS_PER_ROOM;
	}

	/**
	 * Registers a client. Returns null when a connection limit is reached so the
	 * caller can answer with 503 instead of binding another socket and timer.
	 */
	addClient(
		eventId: string,
		controller: SSEController,
		canReceive: (eventType: string) => boolean = () => true
	): (() => void) | null {
		if (this.totalClientCount >= MAX_CLIENTS_GLOBAL) {
			return null;
		}

		if (!this.eventRooms.has(eventId)) {
			this.eventRooms.set(eventId, new Set());
		}

		const room = this.eventRooms.get(eventId)!;
		if (room.size >= MAX_CLIENTS_PER_ROOM) {
			return null;
		}

		const client: ClientConnection = {
			id: Math.random().toString(36).substring(2, 9),
			controller,
			canReceive
		};

		room.add(client);

		// Return cleanup unsubscribe function
		return () => {
			room.delete(client);
			if (room.size === 0) {
				this.eventRooms.delete(eventId);
			}
		};
	}

	broadcast(eventId: string, eventType: string, data: any) {
		const room = this.eventRooms.get(eventId);
		if (!room || room.size === 0) return;

		const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

		for (const client of room) {
			try {
				if (!client.canReceive(eventType)) continue;
				client.controller.enqueue(payload);
			} catch {
				room.delete(client);
			}
		}
	}

	getActiveClientCount(eventId: string): number {
		return this.eventRooms.get(eventId)?.size || 0;
	}
}

export const sseHub = new SSEHub();
