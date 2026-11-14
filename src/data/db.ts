// src/data/db.ts
// The one place that knows about IndexedDB. 7 stores = the 7 tables in types.ts.
// Dexie schema strings list ONLY the primary key and the fields we query by; other fields are still stored.
//   ++id  = auto-increment primary key (explicit ids from the seed files are accepted)
//   &     = unique index
//   [a+b] = compound index
//
// IndexedDB does not enforce foreign keys (crew_id, metric_id...): that is a convention, checked by tests.
// CHANGING A STORE'S INDEXES? Do not edit version(1): add version(2) with the new schema, so browsers
// that already have the old database upgrade instead of breaking (PRD R-10).

import Dexie, { type Table } from 'dexie';
import type {
  ActionLog, Alert, CrewMember, Measurement, Metric, RadiationDose, ReferenceSource,
} from './types';

/**
 * Why Dexie/IndexedDB:
 * - Near-zero latency: local reads and writes avoid network round trips.
 * - Generous storage: IndexedDB supports much more data than localStorage and
 *   stores structured objects, arrays, and Blobs.
 * - JSON backup and restore can be added with dexie-export-import.
 * - Browser DevTools can inspect live data under Application > IndexedDB.
 */
export class VitalisDB extends Dexie {
  crew_member!: Table<CrewMember, number>;
  metric!: Table<Metric, string>;
  measurement!: Table<Measurement, number>;
  radiation_dose_log!: Table<RadiationDose, number>;
  alert!: Table<Alert, number>;
  action_log!: Table<ActionLog, number>;
  reference_source!: Table<ReferenceSource, string>;

  constructor(name = 'vitalisx') {
    super(name);
    this.version(1).stores({
      crew_member: '++id',
      metric: 'id',
      // unique per person + metric + taken_at (PRD F-03); crew_id+metric_id+mission_day for the baseline window
      measurement: '++id, crew_id, metric_id, [crew_id+metric_id+mission_day], &[crew_id+metric_id+taken_at]',
      radiation_dose_log: '++id, crew_id, [crew_id+mission_day]',
      // [crew_id+metric_id+status] finds "the one open alert for this person + metric" (PRD 5.2)
      alert: '++id, crew_id, metric_id, status, [crew_id+metric_id+status]',
      action_log: '++id, crew_id, kind, status, alert_id',
      reference_source: 'id',
    });
  }
}

/** Names of the 7 stores, in a safe order for seeding (parents before children). */
export const STORE_NAMES = [
  'crew_member', 'metric', 'reference_source',
  'measurement', 'radiation_dose_log', 'alert', 'action_log',
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export const db = new VitalisDB();
