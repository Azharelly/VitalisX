import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { VitalisDB } from './db';
import { DATASET_VERSION, ensureSeeded, isSeeded, resetDemo, seedDatabase, type SeedData } from './seed';
import { getCrew, getMeasurements, getOpenAlerts, getRadiationDoses } from './queries';

// minimal in-memory localStorage for the node test environment
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  configurable: true,
});

const fixture = (): SeedData => ({
  crew_member: [
    { id: 1, name: 'Amara Okafor', role: 'Commander', sex: 'F', initials: 'AO', prior_dose_msv: 25, joined_mission_day: 0, is_simulated: true },
    { id: 2, name: 'Kenji Tanaka', role: 'Flight engineer', sex: 'M', initials: 'KT', prior_dose_msv: 130, joined_mission_day: 0, is_simulated: true },
  ],
  metric: [{
    id: 'temp', label: 'Temperature', unit: '°C', zone: 'immune', direction: 'high_is_bad', min_sd: 0.15,
    abs_low: null, abs_high: 37.9, abs_rule: 'Fever from 38.0', default_context: 'resting', decimals: 1, priority: 4, source_ids: [],
  }],
  reference_source: [{ id: 'nasa-std-3001', title: 'NASA-STD-3001', finding: '600 mSv career limit', link_or_doi: '', used_for: 'radiation' }],
  measurement: [
    { id: 1, crew_id: 1, metric_id: 'temp', mission_day: 1, taken_at: '2031-02-02T08:00:00Z', context: null, value: 36.6, source: 'checkin', is_simulated: true },
    { id: 2, crew_id: 1, metric_id: 'temp', mission_day: 2, taken_at: '2031-02-03T08:00:00Z', context: null, value: 36.7, source: 'checkin', is_simulated: true },
    { id: 3, crew_id: 2, metric_id: 'temp', mission_day: 1, taken_at: '2031-02-02T08:00:00Z', context: null, value: 36.5, source: 'checkin', is_simulated: true },
  ],
  radiation_dose_log: [
    { id: 1, crew_id: 1, mission_day: 2, date: '', dose_msv: 1.8, environment: 'mars_transit', sep_flag: false, event_id: null, is_simulated: true },
    { id: 2, crew_id: 1, mission_day: 1, date: '', dose_msv: 1.7, environment: 'mars_transit', sep_flag: false, event_id: null, is_simulated: true },
    { id: 3, crew_id: 2, mission_day: 1, date: '', dose_msv: 1.9, environment: 'mars_transit', sep_flag: false, event_id: null, is_simulated: true },
  ],
  alert: [
    { id: 1, crew_id: 1, metric_id: 'temp', zone: 'immune', level: 'alert', raised_day: 2, resolved_day: null, status: 'open', rule: null, value: 38.2, z: null, baseline_median: null, baseline_sd: null, evidence: [], is_simulated: true },
    { id: 2, crew_id: 1, metric_id: 'temp', zone: 'immune', level: 'watch', raised_day: 1, resolved_day: 2, status: 'resolved', rule: null, value: 37.2, z: 2, baseline_median: 36.6, baseline_sd: 0.2, evidence: [], is_simulated: true },
  ],
  action_log: [],
});

let n = 0;
let db: VitalisDB;
beforeEach(() => {
  store.clear();
  db = new VitalisDB(`test-${n++}`);   // fresh database per test
});

describe('seeding', () => {
  it('loads all stores and records the dataset version', async () => {
    await seedDatabase(fixture(), db);
    expect(await db.crew_member.count()).toBe(2);
    expect(await db.measurement.count()).toBe(3);
    expect(await db.reference_source.count()).toBe(1);
    expect(await isSeeded(db)).toBe(true);
    expect(store.get('vitalisx.dataset_version')).toBe(DATASET_VERSION);
  });

  it('ensureSeeded seeds once, then does nothing', async () => {
    let loads = 0;
    const load = async () => { loads++; return fixture(); };
    expect(await ensureSeeded(db, load)).toBe('seeded');
    expect(await ensureSeeded(db, load)).toBe('already-current');
    expect(loads).toBe(1);
  });

  it('reseeds when the stored dataset version is old', async () => {
    await seedDatabase(fixture(), db);
    store.set('vitalisx.dataset_version', 'old');
    expect(await ensureSeeded(db, async () => fixture())).toBe('seeded');
  });

  it('reseeds when the database was cleared but the version key remains', async () => {
    await seedDatabase(fixture(), db);
    await db.crew_member.clear();
    expect(await ensureSeeded(db, async () => fixture())).toBe('seeded');
  });

  it('is idempotent: seeding twice does not duplicate rows', async () => {
    await seedDatabase(fixture(), db);
    await seedDatabase(fixture(), db);
    expect(await db.crew_member.count()).toBe(2);
    expect(await db.measurement.count()).toBe(3);
  });

  it('a duplicate person+metric+taken_at fails the WHOLE seed and keeps the old data', async () => {
    await seedDatabase(fixture(), db);
    const bad = fixture();
    bad.crew_member.push({ ...bad.crew_member[0], id: 3, name: 'Extra' });
    bad.measurement.push({ ...bad.measurement[0], id: 99 });   // same crew+metric+taken_at as id 1
    await expect(seedDatabase(bad, db)).rejects.toThrow();
    expect(await db.crew_member.count()).toBe(2);              // transaction rolled back
  });
});

describe('resetDemo', () => {
  it('wipes user changes and restores the seed', async () => {
    await seedDatabase(fixture(), db);
    await db.measurement.add({ crew_id: 1, metric_id: 'temp', mission_day: 3, taken_at: '2031-02-04T08:00:00Z', context: null, value: 40, source: 'checkin', is_simulated: false } as never);
    expect(await db.measurement.count()).toBe(4);
    await resetDemo(db, async () => fixture());
    expect(await db.measurement.count()).toBe(3);
  });
});

describe('uniqueness', () => {
  it('rejects a second reading with the same person + metric + taken_at', async () => {
    await seedDatabase(fixture(), db);
    await expect(
      db.measurement.add({ crew_id: 1, metric_id: 'temp', mission_day: 1, taken_at: '2031-02-02T08:00:00Z', context: null, value: 37, source: 'checkin', is_simulated: false } as never),
    ).rejects.toThrow();
  });
  it('allows the same taken_at for a different person', async () => {
    await seedDatabase(fixture(), db);
    expect(await db.measurement.where('crew_id').equals(2).count()).toBe(1);
  });
});

describe('queries', () => {
  beforeEach(async () => { await seedDatabase(fixture(), db); });

  it('getCrew returns people ordered by id', async () => {
    expect((await getCrew(db)).map((c) => c.name)).toEqual(['Amara Okafor', 'Kenji Tanaka']);
  });
  it('getRadiationDoses returns only that person, oldest first', async () => {
    const d = await getRadiationDoses(1, db);
    expect(d.map((x) => x.mission_day)).toEqual([1, 2]);
    expect(d.every((x) => x.crew_id === 1)).toBe(true);
  });
  it('getRadiationDoses is empty for a person with no doses', async () => {
    expect(await getRadiationDoses(99, db)).toEqual([]);
  });
  it('getMeasurements filters by person and metric, oldest first', async () => {
    const m = await getMeasurements(1, 'temp', db);
    expect(m.map((x) => x.value)).toEqual([36.6, 36.7]);
  });
  it('getOpenAlerts returns only open alerts', async () => {
    const a = await getOpenAlerts(1, db);
    expect(a).toHaveLength(1);
    expect(a[0].level).toBe('alert');
  });
});

describe('foreign keys (convention, not enforced by IndexedDB)', () => {
  it('every child row points to an existing person and metric', async () => {
    await seedDatabase(fixture(), db);
    const crewIds = new Set((await db.crew_member.toArray()).map((c) => c.id));
    const metricIds = new Set((await db.metric.toArray()).map((m) => m.id));
    for (const m of await db.measurement.toArray()) {
      expect(crewIds.has(m.crew_id)).toBe(true);
      expect(metricIds.has(m.metric_id)).toBe(true);
    }
    for (const r of await db.radiation_dose_log.toArray()) expect(crewIds.has(r.crew_id)).toBe(true);
    for (const a of await db.alert.toArray()) expect(crewIds.has(a.crew_id)).toBe(true);
  });
});
