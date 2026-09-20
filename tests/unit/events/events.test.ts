import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../../../src/lib/server/db/migrate';
import { getDb } from '../../../src/lib/server/db/client';
import {
  createEvent,
  findEventById,
  findEventByToken,
  regenerateEventToken,
  deleteEvent
} from '../../../src/lib/server/db/repositories/event.repository';
import { registerGuest, findGuestByDeviceToken } from '../../../src/lib/server/db/repositories/guest.repository';
import { upsertRsvp, getRsvpSummary } from '../../../src/lib/server/db/repositories/rsvp.repository';
import { generateIcs } from '../../../src/lib/features/events/ics';
import { generateQrSvg } from '../../../src/lib/features/events/qr';
import { getEventKey } from '../../../src/lib/server/crypto';

import { createUser } from '../../../src/lib/server/db/repositories/user.repository';
import { hashPassword } from '../../../src/lib/server/auth/password';
import { generateRecoveryCodes } from '../../../src/lib/server/auth/recovery';

describe('Events, Guests & RSVP Modules', () => {
  let hostId = '';

  beforeAll(async () => {
    runMigrations();
    const pwdHash = await hashPassword('HostPassword123!');
    const codes = generateRecoveryCodes(10).map((c) => c.codeHash);
    const { user } = createUser(`eventhost-${Date.now()}@party.local`, pwdHash, codes);
    hostId = user.id;
  });

  it('should create an event with envelope encryption, wrapped EK, and token hash', () => {
    const event = createEvent(hostId, {
      title: 'Sommerfest 2026',
      description: 'Grillen und Chillen im Garten',
      dateStart: '2026-07-20T16:00:00.000Z',
      locationName: 'Garten Eden',
      locationAddress: 'Blumenweg 1, 12345 Gartenstadt',
      accentColor: '#34C759'
    });

    expect(event.id).toBeDefined();
    expect(event.token).toBeDefined();
    expect(event.title).toBe('Sommerfest 2026');

    // Fetch by ID (host view)
    const fetched = findEventById(event.id, hostId);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe('Sommerfest 2026');
    expect(fetched!.locationName).toBe('Garten Eden');

    // Fetch by Token (guest view)
    const guestFetched = findEventByToken(event.token!);
    expect(guestFetched).not.toBeNull();
    expect(guestFetched!.id).toBe(event.id);
  });

  it('should register guests and persist their device tokens with encrypted names', () => {
    const event = createEvent(hostId, {
      title: 'Birthday Party',
      dateStart: '2026-08-01T18:00:00.000Z'
    });

    const deviceToken = 'browser-cookie-uuid-1234';
    const guest = registerGuest(event.id, deviceToken, 'Sophie Tester');

    expect(guest.name).toBe('Sophie Tester');
    expect(guest.isHost).toBe(false);

    // Retrieve by device token
    const retrieved = findGuestByDeviceToken(event.id, deviceToken);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe('Sophie Tester');
  });

  it('should manage RSVPs and calculate aggregated totals accurately', () => {
    const event = createEvent(hostId, {
      title: 'Dinner Party',
      dateStart: '2026-09-01T19:00:00.000Z'
    });

    // Guest 1: Yes + 2 companions
    const guest1 = registerGuest(event.id, 'tok-1', 'Markus');
    upsertRsvp(event.id, guest1.id, {
      status: 'yes',
      companionCount: 2,
      companionNames: 'Clara & Felix',
      notes: 'Glutenfrei'
    });

    // Guest 2: Maybe
    const guest2 = registerGuest(event.id, 'tok-2', 'Julia');
    upsertRsvp(event.id, guest2.id, {
      status: 'maybe'
    });

    // Guest 3: No
    const guest3 = registerGuest(event.id, 'tok-3', 'Stefan');
    upsertRsvp(event.id, guest3.id, {
      status: 'no'
    });

    const summary = getRsvpSummary(event.id);
    expect(summary.yesCount).toBe(1);
    expect(summary.maybeCount).toBe(1);
    expect(summary.noCount).toBe(1);
    expect(summary.totalAttending).toBe(3); // 1 guest + 2 companions
    expect(summary.attendees).toHaveLength(1);
    expect(summary.attendees[0].name).toBe('Markus');
  });

  it('should regenerate token and invalidate the old link', () => {
    const event = createEvent(hostId, {
      title: 'Regen Test',
      dateStart: '2026-10-01T12:00:00.000Z'
    });

    const oldToken = event.token!;
    const newToken = regenerateEventToken(event.id, hostId);
    expect(newToken).not.toBeNull();
    expect(newToken).not.toBe(oldToken);

    // Old token must fail
    const oldFetch = findEventByToken(oldToken);
    expect(oldFetch).toBeNull();

    // New token must succeed
    const newFetch = findEventByToken(newToken!);
    expect(newFetch).not.toBeNull();
    expect(newFetch!.id).toBe(event.id);
  });

  it('should generate valid .ics calendar files and local SVG QR codes', async () => {
    const ics = generateIcs({
      id: 'event-ics-123',
      title: 'Party Time',
      description: 'Bring snacks',
      dateStart: '2026-11-15T18:00:00.000Z',
      locationName: 'Lounge 44'
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Party Time');
    expect(ics).toContain('VALARM');

    const qrSvg = await generateQrSvg('https://example.com/e/token123');
    expect(qrSvg).toContain('<svg');
  });

  it('should delete event and shred event key from disk (Crypto-Shredding)', () => {
    const event = createEvent(hostId, {
      title: 'To Be Shredded',
      dateStart: '2026-12-31T20:00:00.000Z'
    });

    // Check key exists
    expect(getEventKey(event.id)).toBeDefined();

    // Delete event
    const deleted = deleteEvent(event.id, hostId);
    expect(deleted).toBe(true);

    // DB row gone
    expect(findEventById(event.id)).toBeNull();

    // Key shredded
    expect(() => getEventKey(event.id)).toThrow();
  });
});