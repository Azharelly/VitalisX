import { db as defaultDb, type VitalisDB } from './db';
import type { EmergencySession } from '../features/emergency/model';

/** Save the complete emergency snapshot so timers, assignments, packets, and the event log survive reloads. */
export async function saveEmergencySession(
  session: EmergencySession,
  database: VitalisDB = defaultDb,
): Promise<void> {
  const groundPackets = session.groundPackets ?? (session.groundPacket ? [session.groundPacket] : []);
  await database.emergency_session.put({ ...session, groundPackets });
}

/** Return the newest saved emergency, including ended sessions for the in-app incident history. */
export async function loadLatestEmergencySession(
  database: VitalisDB = defaultDb,
): Promise<EmergencySession | null> {
  const stored = await database.emergency_session.orderBy('startedAtIso').reverse().first();
  if (!stored) return null;
  return {
    ...stored,
    groundPackets: stored.groundPackets ?? (stored.groundPacket ? [stored.groundPacket] : []),
  };
}
