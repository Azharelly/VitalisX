import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { VitalisDB } from './db';
import { DATASET_VERSION, ensureSeeded, isSeeded, resetDemo, seedDatabase, type SeedData } from './seed';
import Dexie from 'dexie';
import { getActiveCrew, getCrew, getLatestMeasurement, getMeasurements, getOpenAlerts, getRadiationDoses, removeCrewMember } from './queries';

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
    { id: 1, name: 'Amara Okafor', role: 'Commander', sex: 'F', initials: 'AO', prior_dose_msv: 25, joined_mission_day: 0, removed_at: null, is_simulated: true },
    { id: 2, name: 'Kenji Tanaka', role: 'Flight engineer', sex: 'M', initials: 'KT', prior_dose_msv: 130, joined_mission_day: 0, removed_at: null, is_simulated: true },
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
    expect((await db.app_meta.get('dataset_version'))?.value).toBe(DATASET_VERSION);
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
    await db.app_meta.put({ key: 'dataset_version', value: 'old' });
    expect(await ensureSeeded(db, async () => fixture())).toBe('seeded');
  });

  it('preserves saved rows when the localStorage version marker was cleared', async () => {
    await seedDatabase(fixture(), db);
    await db.measurement.add({
      crew_id: 1, metric_id: 'temp', mission_day: 9, taken_at: '2031-02-10T08:00:00Z',
      context: null, value: 36.9, source: 'checkin', is_simulated: false,
    } as never);
    await db.app_meta.delete('dataset_version');
    store.clear();
    let loads = 0;
    expect(await ensureSeeded(db, async () => { loads++; return fixture(); })).toBe('already-current');
    expect(loads).toBe(0);
    expect(await db.measurement.count()).toBe(4);
    expect((await db.app_meta.get('dataset_version'))?.value).toBe(DATASET_VERSION);
  });

  it('preserves saved rows when localStorage is blocked', async () => {
    await seedDatabase(fixture(), db);
    await db.measurement.add({
      crew_id: 1, metric_id: 'temp', mission_day: 9, taken_at: '2031-02-10T08:00:00Z',
      context: null, value: 36.9, source: 'checkin', is_simulated: false,
    } as never);
    await db.app_meta.delete('dataset_version');
    Object.defineProperty(globalThis, 'localStorage', {
      get: () => { throw new Error('storage blocked'); },
      configurable: true,
    });
    let loads = 0;
    expect(await ensureSeeded(db, async () => { loads++; return fixture(); })).toBe('already-current');
    expect(loads).toBe(0);
    expect(await db.measurement.count()).toBe(4);
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
  it('getMeasurements is empty (not an error) when there are no readings', async () => {
    expect(await getMeasurements(99, 'temp', db)).toEqual([]);
    expect(await getMeasurements(1, 'hr', db)).toEqual([]);
  });
  it('getMeasurements can keep one context; no context counts as the metric default', async () => {
    await db.measurement.add({ id: 4, crew_id: 1, metric_id: 'temp', mission_day: 3, taken_at: '2031-02-04T08:00:00Z', context: 'after_exercise', value: 37.4, source: 'checkin', is_simulated: true });
    expect((await getMeasurements(1, 'temp', db, 'resting')).map((x) => x.value)).toEqual([36.6, 36.7]);
    expect((await getMeasurements(1, 'temp', db, 'after_exercise')).map((x) => x.value)).toEqual([37.4]);
    expect(await getMeasurements(1, 'temp', db, 'fasting')).toEqual([]);
  });
  it('getLatestMeasurement returns the newest reading, or null when there is none', async () => {
    expect((await getLatestMeasurement(1, 'temp', db))?.value).toBe(36.7);
    expect(await getLatestMeasurement(99, 'temp', db)).toBeNull();
  });
  it('getLatestMeasurement can look at one context only', async () => {
    await db.measurement.add({ id: 4, crew_id: 1, metric_id: 'temp', mission_day: 3, taken_at: '2031-02-04T08:00:00Z', context: 'after_exercise', value: 37.4, source: 'checkin', is_simulated: true });
    expect((await getLatestMeasurement(1, 'temp', db))?.value).toBe(37.4);
    expect((await getLatestMeasurement(1, 'temp', db, 'resting'))?.value).toBe(36.7);
  });
  it('getOpenAlerts is empty (not an error) when there are none', async () => {
    expect(await getOpenAlerts(2, db)).toEqual([]);
    expect(await getOpenAlerts(99, db)).toEqual([]);
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

describe('CrewMember.removed_at (issue #5)', () => {
  it('seeded crew keep removed_at = null', async () => {
    await seedDatabase(fixture(), db);
    expect((await db.crew_member.toArray()).every((c) => c.removed_at === null)).toBe(true);
  });

  it('removeCrewMember sets removed_at, hides the person from getActiveCrew, keeps their data', async () => {
    await seedDatabase(fixture(), db);
    expect(await removeCrewMember(2, '2031-03-01T00:00:00Z', db)).toBe(true);
    expect((await getActiveCrew(db)).map((c) => c.id)).toEqual([1]);
    expect((await getCrew(db)).map((c) => c.id)).toEqual([1, 2]);       // still in the full list
    expect((await db.crew_member.get(2))?.removed_at).toBe('2031-03-01T00:00:00Z');
    expect(await db.radiation_dose_log.where('crew_id').equals(2).count()).toBe(1);   // history stays
  });

  it('removeCrewMember returns false for an unknown id', async () => {
    await seedDatabase(fixture(), db);
    expect(await removeCrewMember(99, undefined, db)).toBe(false);
  });

  it('upgrading an existing v1 database backfills removed_at = null', async () => {
    const name = `upgrade-${n++}`;
    const v1 = new Dexie(name);                         // what an old browser already has
    v1.version(1).stores({ crew_member: '++id' });
    await v1.table('crew_member').add({ name: 'Old Row', role: 'Pilot', sex: 'F', initials: 'OR', prior_dose_msv: 0, joined_mission_day: 0, is_simulated: true });
    v1.close();

    const upgraded = new VitalisDB(name);               // opens at v2 and runs the upgrade
    const rows = await upgraded.crew_member.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].removed_at).toBeNull();
    expect((await getActiveCrew(upgraded)).map((c) => c.name)).toEqual(['Old Row']);
  });
});
