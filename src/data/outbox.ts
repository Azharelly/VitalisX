// src/data/outbox.ts
// F-07 outbox: messages for Earth that must survive a reload and a dead link.
// Stored in action_log as kind 'sbar_outbox' (types.ts), status 'queued' -> 'sent'. Nothing is deleted when sent: it is a log.

import { db as defaultDb, type VitalisDB } from './db';
import { VALID_STATUS, type ActionLog } from './types';

/** One-way Earth-Mars delay used when the caller does not know better (mission_config.comms_delay_sec). */
export const DEFAULT_COMMS_DELAY_SEC = 750;

export interface OutboxMessage {
  id: number;
  crewId: string;
  day: number;
  text: string;
  status: 'queued' | 'sent';
  createdAt: string;
  delaySec: number | null;
}

export interface QueueInput { crewId: string; day: number; text: string; delaySec?: number }

/** What the UI needs. Dexie is one implementation; tests and a server can be others. */
export interface OutboxPort {
  queue(input: QueueInput): Promise<OutboxMessage>;
  list(crewId: string): Promise<OutboxMessage[]>;   // newest first
  markSent(id: number): Promise<boolean>;           // false if it was not queued
  discard(id: number): Promise<boolean>;            // only a queued message can be discarded
}

/** Sends one message to Earth. Rejects when the link is down; the message then stays queued. */
export type SendToEarth = (m: OutboxMessage) => Promise<void>;

const toMessage = (r: ActionLog, crewId: string): OutboxMessage => ({
  id: r.id, crewId, day: r.mission_day, text: r.text, createdAt: r.created_at, delaySec: r.delay_sec,
  status: r.status === 'sent' ? 'sent' : 'queued',
});

/**
 * Outbox on top of the action_log store.
 * `resolveCrew` maps the app's crew id to the numeric crew_id of the table. The demo's simulated ids ("amara")
 * are not numbers, so the app passes a lookup; the default accepts numeric ids only and fails loudly otherwise.
 */
export function dexieOutbox(
  database: VitalisDB = defaultDb,
  resolveCrew: (crewId: string) => number | undefined = (id) => (/^\d+$/.test(id) ? Number(id) : undefined),
  now: () => Date = () => new Date(),
): OutboxPort {
  const crewNumber = (crewId: string) => {
    const n = resolveCrew(crewId);
    if (n === undefined) throw new Error(`Outbox: no numeric crew id for "${crewId}"`);
    return n;
  };
  const isOutbox = (r: ActionLog) => r.kind === 'sbar_outbox';
  return {
    async queue({ crewId, day, text, delaySec = DEFAULT_COMMS_DELAY_SEC }) {
      const body = text.trim();
      if (!body) throw new Error('Outbox: cannot queue an empty message');
      const row: Omit<ActionLog, 'id'> = {
        crew_id: crewNumber(crewId), alert_id: null, mission_day: day, created_at: now().toISOString(),
        kind: 'sbar_outbox', category: null, text: body, status: 'queued', delay_sec: delaySec, is_simulated: true,
      };
      const id = await database.action_log.add(row as ActionLog);
      return toMessage({ ...row, id }, crewId);
    },
    async list(crewId) {
      const rows = await database.action_log.where('crew_id').equals(crewNumber(crewId)).filter(isOutbox).toArray();
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).map((r) => toMessage(r, crewId));
    },
    async markSent(id) {
      return database.transaction('rw', database.action_log, async () => {
        const r = await database.action_log.get(id);
        if (!r || !isOutbox(r) || r.status !== 'queued' || !VALID_STATUS.sbar_outbox.includes('sent')) return false;
        return (await database.action_log.update(id, { status: 'sent' })) === 1;
      });
    },
    async discard(id) {
      return database.transaction('rw', database.action_log, async () => {
        const r = await database.action_log.get(id);
        if (!r || !isOutbox(r) || r.status !== 'queued') return false;
        await database.action_log.delete(id);
        return true;
      });
    },
  };
}

/**
 * Sends every queued message of one person, oldest first, and marks each sent. Stops at the first failure so the
 * order Earth receives is the order the crew wrote; the rest stay queued for the next try.
 */
export async function flushOutbox(
  outbox: OutboxPort, crewId: string, send: SendToEarth,
): Promise<{ sent: number; remaining: number; error?: Error }> {
  const queued = (await outbox.list(crewId)).filter((m) => m.status === 'queued').reverse();
  let sent = 0;
  for (const m of queued) {
    try {
      await send(m);
    } catch (e) {
      return { sent, remaining: queued.length - sent, error: e instanceof Error ? e : new Error(String(e)) };
    }
    await outbox.markSent(m.id);
    sent++;
  }
  return { sent, remaining: 0 };
}

/** Demo transport: no real Earth link exists yet, so this "sends" after a short pause. Replace when the link lands. */
export const simulatedEarthLink: SendToEarth = () => new Promise((resolve) => setTimeout(resolve, 400));

/** Seconds until a message reaches Earth: created_at + delay_sec - now. 0 = arrived. Derived from stored fields only. */
export function arrivalLeftSec(
  m: Pick<OutboxMessage, 'createdAt' | 'delaySec'>,
  now: number,
  fallbackDelaySec = DEFAULT_COMMS_DELAY_SEC,
): number {
  const at = Date.parse(m.createdAt) + (m.delaySec ?? fallbackDelaySec) * 1000
  return Math.max(0, Math.ceil((at - now) / 1000))
}
