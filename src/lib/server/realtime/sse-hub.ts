type SSEController = ReadableStreamDefaultController<string>;

interface ClientConnection {
  id: string;
  controller: SSEController;
}

class SSEHub {
  private eventRooms = new Map<string, Set<ClientConnection>>();

  addClient(eventId: string, controller: SSEController): () => void {
    if (!this.eventRooms.has(eventId)) {
      this.eventRooms.set(eventId, new Set());
    }

    const room = this.eventRooms.get(eventId)!;
    const client: ClientConnection = {
      id: Math.random().toString(36).substring(2, 9),
      controller
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