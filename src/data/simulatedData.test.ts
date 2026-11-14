// Checks that the simulated files in public/data seed cleanly and tell the four stories
// through the real engine (evaluate, evaluateRadiation). If you regenerate the data and a story
// changes, this test tells you.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { VitalisDB } from './db';
import { seedDatabase, type SeedData } from './seed';
import { evaluate } from '../engine/evaluate';
import { evaluateRadiation } from '../engine/radiation';
import type { MetricId, MissionConfig } from './types';

const read = <T,>(name: string): T => JSON.parse(readFileSync(`public/data/${name}.json`, 'utf8')) as T;
const STORES = ['crew_member', 'metric', 'reference_source', 'measurement', 'radiation_dose_log', 'alert', 'action_log'] as const;

let db: VitalisDB;
let cfg: MissionConfig;
beforeAll(async () => {
  db = new VitalisDB('simulated-data');
  const data = Object.fromEntries(STORES.map((s) => [s, read(s)])) as unknown as SeedData;
  cfg = read<MissionConfig>('mission_config');
  await seedDatabase(data, db);
});

const evalOf = async (crew: number, metric: MetricId) => {
  const m = (await db.metric.get(metric))!;
  const rows = await db.measurement.where('[crew_id+metric_id+mission_day]')
    .between([crew, metric, -Infinity], [crew, metric, Infinity]).toArray();
  return evaluate(m, rows);
};

describe('simulated data', () => {
  it('seeds with unique readings and flags everything as simulated', async () => {
    expect(await db.crew_member.count()).toBe(4);
    expect((await db.measurement.toArray()).every((m) => m.is_simulated)).toBe(true);
  });

  it('Lucía (id 3): everything normal', async () => {
    for (const id of ['sleep', 'hr', 'sys', 'dia', 'spo2', 'temp', 'weight', 'glucose'] as MetricId[]) {
      expect(['ok', 'learn'], id).toContain((await evalOf(3, id)).state);
    }
  });
  it('Ravi (id 4): temperature alert, heart rate watch or alert', async () => {
    expect((await evalOf(4, 'temp')).state).toBe('alert');
    expect(['watch', 'alert']).toContain((await evalOf(4, 'hr')).state);
  });
  it('Amara (id 1): sleep watch', async () => {
    expect((await evalOf(1, 'sleep')).state).toBe('watch');
  });
  it('Kenji (id 2): radiation projection reaches watch', async () => {
    const doses = await db.radiation_dose_log.where('crew_id').equals(2).toArray();
    const crew = (await db.crew_member.get(2))!;
    const r = evaluateRadiation({
      doses, priorDoseMsv: crew.prior_dose_msv, currentDay: cfg.today_mission_day, arrivalDay: cfg.arrival_day,
    });
    console.log('Kenji radiation', r.state, r.careerMsv, r.projectionFraction);
    expect(r.state).toBe('watch');
  });
});
