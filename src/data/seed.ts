// src/data/seed.ts
// Loads the simulated JSON files (public/data/*.json) into IndexedDB, and resets the demo.
// Versioned: if DATASET_VERSION changes, the next start wipes and reseeds (PRD R-10).
// No network is needed after the files are cached by the PWA.

import type {
  ActionLog, Alert, CrewMember, Measurement, Metric, MissionConfig, RadiationDose, ReferenceSource,
} from './types';
import { db as defaultDb, STORE_NAMES, type VitalisDB } from './db';

/** Bump this whenever the simulated data or the schema changes. */
export const DATASET_VERSION = '2026-11-14.2';
const VERSION_KEY = 'vitalisx.dataset_version';

export interface SeedData {
  crew_member: CrewMember[];
  metric: Metric[];
  reference_source: ReferenceSource[];
  measurement: Measurement[];
  radiation_dose_log: RadiationDose[];
  alert: Alert[];
  action_log: ActionLog[];
}

// ---------- stored dataset version (localStorage may be missing or blocked: R-25) ----------
function readVersion(): string | null {
  try { return globalThis.localStorage?.getItem(VERSION_KEY) ?? null; } catch { return null; }
}
function writeVersion(v: string | null): void {
  try {
    if (v === null) globalThis.localStorage?.removeItem(VERSION_KEY);
    else globalThis.localStorage?.setItem(VERSION_KEY, v);
  } catch { /* storage blocked: we will simply reseed next time */ }
}

// ---------- loading the JSON files ----------
async function fetchJson<T>(file: string, base: string): Promise<T> {
  const res = await fetch(`${base}${file}`);
  if (!res.ok) throw new Error(`Could not load ${file} (${res.status})`);
  return (await res.json()) as T;
}

/** Reads the 7 table files from public/data. File names = store names, e.g. crew_member.json. */
export async function loadSeedFiles(base = `${import.meta.env.BASE_URL}data/`): Promise<SeedData> {
  const entries = await Promise.all(
    STORE_NAMES.map(async (name) => [name, await fetchJson<unknown[]>(`${name}.json`, base)] as const),
  );
  return Object.fromEntries(entries) as unknown as SeedData;
}

/** mission_config.json is configuration, not a table. */
export async function loadMissionConfig(base = `${import.meta.env.BASE_URL}data/`): Promise<MissionConfig> {
  return fetchJson<MissionConfig>('mission_config.json', base);
}

// ---------- seeding ----------

/**
 * Replaces ALL data with `data` in ONE transaction: it either fully succeeds or leaves the old data.
 * A duplicate (person + metric + taken_at) makes the whole seed fail, on purpose.
 */
export async function seedDatabase(data: SeedData, database: VitalisDB = defaultDb): Promise<void> {
  const tables = STORE_NAMES.map((n) => database.table(n));
  await database.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear();
    for (const name of STORE_NAMES) await database.table(name).bulkAdd(data[name]);
  });
  writeVersion(DATASET_VERSION);
}

/** True if the data in this browser is current (right version and not empty). */
export async function isSeeded(database: VitalisDB = defaultDb): Promise<boolean> {
  return readVersion() === DATASET_VERSION && (await database.crew_member.count()) > 0;
}

/**
 * Call once at app start. Seeds on first run, or when the dataset version changed.
 * `load` is injectable so tests do not need the network.
 */
export async function ensureSeeded(
  database: VitalisDB = defaultDb,
  load: () => Promise<SeedData> = loadSeedFiles,
): Promise<'already-current' | 'seeded'> {
  if (await isSeeded(database)) return 'already-current';
  await seedDatabase(await load(), database);
  return 'seeded';
}

/** "Reset demo" button: wipes this app's data and reseeds from the files. */
export async function resetDemo(
  database: VitalisDB = defaultDb,
  load: () => Promise<SeedData> = loadSeedFiles,
): Promise<void> {
  writeVersion(null);
  await seedDatabase(await load(), database);
}
