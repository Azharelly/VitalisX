import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { VitalisDB } from './db';
import { dexieOutbox, flushOutbox, type OutboxPort } from './outbox';

let n = 0;
let db: VitalisDB;
let outbox: OutboxPort;
let clock = 0;
beforeEach(() => {
  db = new VitalisDB(`outbox-${n++}`);
  clock = 0;
  outbox = dexieOutbox(db, undefined, () => new Date(Date.UTC(2031, 0, 1, 0, 0, clock++)));
});

const msg = (text = 'S — Situation\nHello', crewId = '1') => ({ crewId, day: 142, text });

describe('queue', () => {
  it('stores a queued sbar_outbox row in action_log with the delay', async () => {
    const m = await outbox.queue({ ...msg(), delaySec: 600 });
    expect(m).toMatchObject({ status: 'queued', day: 142, delaySec: 600, crewId: '1' });
    const row = await db.action_log.get(m.id);
    expect(row).toMatchObject({ kind: 'sbar_outbox', status: 'queued', crew_id: 1, alert_id: null, category: null, delay_sec: 600 });
  });
  it('rejects an empty message and trims the text', async () => {
    await expect(outbox.queue(msg('   '))).rejects.toThrow(/empty/);
    expect((await outbox.queue(msg('  hi  '))).text).toBe('hi');
  });
  it('survives a "reload": a new outbox over the same database sees the queue', async () => {
    await outbox.queue(msg('first'));
    const again = dexieOutbox(db);
    expect((await again.list('1')).map((m) => m.text)).toEqual(['first']);
  });
  it('fails loudly for a crew id it cannot map to a number', async () => {
    await expect(outbox.queue(msg('x', 'amara'))).rejects.toThrow(/amara/);
  });
});

describe('list', () => {
  it('is per person, newest first, and ignores other action kinds', async () => {
    await outbox.queue(msg('a'));
    await outbox.queue(msg('b'));
    await outbox.queue(msg('other person', '2'));
    await db.action_log.add({
      crew_id: 1, alert_id: null, mission_day: 1, created_at: '2031-01-01T00:00:00Z', kind: 'done', category: null,
      text: 'not an outbox row', status: 'done', delay_sec: null, is_simulated: true,
    } as never);
    expect((await outbox.list('1')).map((m) => m.text)).toEqual(['b', 'a']);
  });
});

describe('markSent / discard', () => {
  it('marks a queued message sent once, keeps it in the log', async () => {
    const m = await outbox.queue(msg());
    expect(await outbox.markSent(m.id)).toBe(true);
    expect(await outbox.markSent(m.id)).toBe(false);
    expect((await outbox.list('1'))[0].status).toBe('sent');
  });
  it('discards only queued messages', async () => {
    const a = await outbox.queue(msg('a'));
    const b = await outbox.queue(msg('b'));
    await outbox.markSent(b.id);
    expect(await outbox.discard(a.id)).toBe(true);
    expect(await outbox.discard(b.id)).toBe(false);
    expect(await outbox.discard(999)).toBe(false);
    expect((await outbox.list('1')).map((m) => m.text)).toEqual(['b']);
  });
});

describe('flushOutbox', () => {
  it('sends oldest first and marks each sent', async () => {
    await outbox.queue(msg('1st'));
    await outbox.queue(msg('2nd'));
    const order: string[] = [];
    const r = await flushOutbox(outbox, '1', async (m) => void order.push(m.text));
    expect(order).toEqual(['1st', '2nd']);
    expect(r).toEqual({ sent: 2, remaining: 0 });
    expect((await outbox.list('1')).every((m) => m.status === 'sent')).toBe(true);
  });
  it('stops at the first failure, keeps the rest queued, and a retry continues in order', async () => {
    await outbox.queue(msg('1st'));
    await outbox.queue(msg('2nd'));
    await outbox.queue(msg('3rd'));
    let down = true;
    const sent: string[] = [];
    const link = async (m: { text: string }) => {
      if (m.text === '2nd' && down) throw new Error('link down');
      sent.push(m.text);
    };
    const r1 = await flushOutbox(outbox, '1', link);
    expect(r1).toMatchObject({ sent: 1, remaining: 2 });
    expect(r1.error?.message).toBe('link down');
    expect((await outbox.list('1')).filter((m) => m.status === 'queued').map((m) => m.text)).toEqual(['3rd', '2nd']);
    down = false;
    expect(await flushOutbox(outbox, '1', link)).toEqual({ sent: 2, remaining: 0 });
    expect(sent).toEqual(['1st', '2nd', '3rd']);
  });
  it('does nothing when the queue is empty', async () => {
    expect(await flushOutbox(outbox, '1', async () => { throw new Error('must not be called'); })).toEqual({ sent: 0, remaining: 0 });
  });
});
