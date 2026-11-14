import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { VitalisDB } from './db';
import { saveCheckIn } from './checkin';
import { seedDatabase, type SeedData } from './seed';

const STORES = ['crew_member', 'metric', 'reference_source', 'measurement', 'radiation_dose_log', 'alert', 'action_log'] as const;
const read = (n: string) => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8'));

let db: VitalisDB;
let n = 0;
beforeEach(async () => {
  db = new VitalisDB(`checkin-${n++}`);
  await seedDatabase(Object.fromEntries(STORES.map((s) => [s, read(s)])) as unknown as SeedData, db);
});

const at = (day: number) => `2031-06-${String(day).padStart(2, '0')}T07:30:00Z`; // day 143 of the simulated mission

describe('saveCheckIn', () => {
  it('saves one reading per answered metric and opens no alert when all is normal', async () => {
    const before = await db.measurement.count();
    const res = await saveCheckIn(3, { sleep: { value: 6.5 }, hr: { value: 64 }, temp: { value: 36.9 } }, at(23), 143, db);
    expect(await db.measurement.count()).toBe(before + 3);
    expect(res.results).toHaveLength(3);
    expect(res.changed).toHaveLength(0);
  });

  it('opens a temperature alert on a fever and reports it as changed', async () => {
    const res = await saveCheckIn(3, { temp: { value: 38.4 } }, at(23), 143, db);
    expect(res.changed.map((c) => c.metric_id)).toEqual(['temp']);
    expect(res.changed[0].result.change).toBe('opened');
    expect(await db.alert.where('crew_id').equals(3).count()).toBe(1);
  });

  it('skips non-finite values instead of failing the whole check-in', async () => {
    const res = await saveCheckIn(3, { sleep: { value: Number.NaN }, hr: { value: 64 } }, at(23), 143, db);
    expect(res.skipped).toEqual(['sleep']);
    expect(res.results).toHaveLength(1);
  });

  it('saving again with the same time corrects the readings instead of duplicating them', async () => {
    await saveCheckIn(3, { hr: { value: 64 } }, at(23), 143, db);
    const count = await db.measurement.count();
    await saveCheckIn(3, { hr: { value: 66 } }, at(23), 143, db);
    expect(await db.measurement.count()).toBe(count);
  });
});
