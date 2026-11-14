import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { VitalisDB } from './db';
import { recompute, type NewMeasurement } from './recompute';
import type { Metric } from './types';

const temp: Metric = {
  id: 'temp', label: 'Temperature', unit: '°C', zone: 'immune', direction: 'high_is_bad', min_sd: 0.15,
  abs_low: null, abs_high: 37.9, abs_rule: 'Fever from 38.0', default_context: 'resting', decimals: 1, priority: 4, source_ids: [],
};
const r = (day: number, value: number): NewMeasurement => ({
  mission_day: day, taken_at: `2031-03-${String(day).padStart(2, '0')}T08:00:00Z`, context: null, value, source: 'checkin', is_simulated: false,
});
const steady = Array.from({ length: 14 }, (_, i) => r(i + 1, i % 2 ? 36.6 : 36.7));

let n = 0;
let db: VitalisDB;
beforeEach(async () => {
  db = new VitalisDB(`recompute-${n++}`);
  await db.metric.put(temp);
});
const open = () => db.alert.where('status').equals('open').toArray();

describe('recompute', () => {
  it('saves readings and opens no alert while all is normal', async () => {
    const res = await recompute(1, 'temp', steady, db);
    expect(await db.measurement.count()).toBe(14);
    expect(res.change).toBe('unchanged');
    expect(await db.alert.count()).toBe(0);
  });

  it('opens an alert on a fever, with evidence', async () => {
    await recompute(1, 'temp', steady, db);
    const res = await recompute(1, 'temp', [r(15, 38.4)], db);
    expect(res.change).toBe('opened');
    const [a] = await open();
    expect(a.level).toBe('alert');
    expect(a.raised_day).toBe(15);
    expect(a.evidence.at(-1)).toEqual({ mission_day: 15, value: 38.4 });
  });

  it('keeps one open alert per person + metric and keeps raised_day', async () => {
    await recompute(1, 'temp', [...steady, r(15, 38.4)], db);
    const res = await recompute(1, 'temp', [r(16, 38.6)], db);
    expect(res.change).toBe('updated');
    const rows = await open();
    expect(rows).toHaveLength(1);
    expect(rows[0].raised_day).toBe(15);
    expect(rows[0].value).toBe(38.6);
    expect(rows[0].evidence.map((p) => p.mission_day)).toContain(15);
  });

  it('resolves the alert when the reading is back to normal, evidence untouched', async () => {
    await recompute(1, 'temp', [...steady, r(15, 38.4)], db);
    const before = (await open())[0];
    const res = await recompute(1, 'temp', [r(16, 36.6)], db);
    expect(res.change).toBe('resolved');
    expect(await open()).toHaveLength(0);
    const after = await db.alert.get(before.id);
    expect(after?.status).toBe('resolved');
    expect(after?.resolved_day).toBe(16);
    expect(after?.evidence).toEqual(before.evidence);
  });

  it('a correction with the same taken_at replaces the reading instead of adding one', async () => {
    await recompute(1, 'temp', [...steady, r(15, 38.4)], db);
    await recompute(1, 'temp', [r(15, 36.6)], db);
    expect(await db.measurement.count()).toBe(15);
    expect(await open()).toHaveLength(0);
  });

  it('does not touch other crew members', async () => {
    await recompute(1, 'temp', [...steady, r(15, 38.4)], db);
    await recompute(2, 'temp', [r(15, 36.6)], db);
    expect((await open()).map((a) => a.crew_id)).toEqual([1]);
  });

  it('rolls back everything when the metric is unknown', async () => {
    await expect(recompute(1, 'hr', [r(1, 60)], db)).rejects.toThrow(/unknown metric/);
    expect(await db.measurement.count()).toBe(0);
  });
});
