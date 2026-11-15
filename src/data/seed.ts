// src/data/seed.ts
// Loads the simulated JSON files (public/data/*.json) into IndexedDB, and resets the demo.
// Versioned: a confirmed dataset-version change reseeds (PRD R-10); a missing localStorage key does not.
// No network is needed after the files are cached by the PWA.

import type {
  ActionLog, Alert, CrewMember, Measurement, Metric, MissionConfig, RadiationDose, ReferenceSource,
} from './types';
import { db as defaultDb, STORE_NAMES, type VitalisDB } from './db';

/** Bump this whenever the simulated data or the schema changes. */
export const DATASET_VERSION = '2026-11-15.1';
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

// ---------- stored dataset version ----------
function readVersion(): string | null {
  try { return globalThis.localStorage?.getItem(VERSION_KEY) ?? null; } catch { return null; }
}
function writeVersion(v: string | null): void {
  try {
    if (v === null) globalThis.localStorage?.removeItem(VERSION_KEY);
    else globalThis.localStorage?.setItem(VERSION_KEY, v);
  } catch { /* the durable IndexedDB marker remains authoritative */ }
}

async function storedVersion(database: VitalisDB): Promise<string | null> {
  const marker = await database.app_meta.get('dataset_version');
  // Read the old marker once for databases created before the IndexedDB-backed marker existed.
  return marker?.value ?? readVersion();
}

async function hasAnySavedData(database: VitalisDB): Promise<boolean> {
  const counts = await Promise.all(STORE_NAMES.map((name) => database.table(name).count()));
  return counts.some((count) => count > 0);
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
  await database.transaction('rw', [...tables, database.app_meta], async () => {
    for (const t of tables) await t.clear();
    for (const name of STORE_NAMES) await database.table(name).bulkAdd(data[name]);
    await database.app_meta.put({ key: 'dataset_version', value: DATASET_VERSION });
  });
  writeVersion(DATASET_VERSION);
}

/** True if the data in this browser is current (right version and not empty). */
export async function isSeeded(database: VitalisDB = defaultDb): Promise<boolean> {
  return (await storedVersion(database)) === DATASET_VERSION && (await database.crew_member.count()) > 0;
}

/**
 * Call once at app start. Seeds on first run, or when the dataset version changed.
 * `load` is injectable so tests do not need the network.
 */
export async function ensureSeeded(
  database: VitalisDB = defaultDb,
  load: () => Promise<SeedData> = loadSeedFiles,
): Promise<'already-current' | 'seeded'> {
  const version = await storedVersion(database);
  if (version === DATASET_VERSION && (await database.crew_member.count()) > 0) return 'already-current';

  // localStorage may be cleared or blocked independently of IndexedDB. Existing records mean
  // this is not a fresh install; preserve them and establish the new durable marker instead
  // of replacing check-ins, crew, alerts, and queued messages with demo rows.
  if (version === null && await hasAnySavedData(database)) {
    await database.app_meta.put({ key: 'dataset_version', value: DATASET_VERSION });
    writeVersion(DATASET_VERSION);
    return 'already-current';
  }
  await seedDatabase(await load(), database);
  return 'seeded';
}

/** "Reset demo" button: wipes this app's data and reseeds from the files. */
export async function resetDemo(
  database: VitalisDB = defaultDb,
  load: () => Promise<SeedData> = loadSeedFiles,
): Promise<void> {
  writeVersion(null);
  await database.emergency_session.clear();
  await seedDatabase(await load(), database);
}
