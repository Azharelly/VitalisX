// src/data/queries.ts
// Small read helpers so screens never touch Dexie directly.
// Screens call these; the engine (src/engine) never imports from here.

import Dexie from 'dexie';
import { byTime, contextOf } from '../engine/baseline';
import { db as defaultDb, type VitalisDB } from './db';
import type { ActionLog, Alert, Context, CrewMember, Measurement, MetricId, RadiationDose } from './types';

/** Everyone ever on the crew, including people who were removed (their history stays). */
export function getCrew(database: VitalisDB = defaultDb): Promise<CrewMember[]> {
  return database.crew_member.orderBy('id').toArray();
}

/** Crew who have not been removed (removed_at is null; undefined from an old row counts as active). */
export function getActiveCrew(database: VitalisDB = defaultDb): Promise<CrewMember[]> {
  return database.crew_member.orderBy('id').filter((c) => c.removed_at == null).toArray();
}

/** Marks a person as removed without deleting their measurements, doses or alerts. */
export async function removeCrewMember(
  id: number, at: string = new Date().toISOString(), database: VitalisDB = defaultDb,
): Promise<boolean> {
  return (await database.crew_member.update(id, { removed_at: at })) === 1;
}

/** Daily doses of ONE person, oldest first. This is what evaluateRadiation() needs. */
export function getRadiationDoses(crewId: number, database: VitalisDB = defaultDb): Promise<RadiationDose[]> {
  return database.radiation_dose_log
    .where('[crew_id+mission_day]').between([crewId, Dexie.minKey], [crewId, Dexie.maxKey]).toArray();
}

/**
 * Readings of one metric for one person, oldest first.
 * Pass `context` to keep only readings that count under it (a reading without its own context
 * counts under the metric's default, the same rule the engine uses). No readings = empty list.
 */
export async function getMeasurements(
  crewId: number, metricId: MetricId, database: VitalisDB = defaultDb, context?: Context,
): Promise<Measurement[]> {
  const rows = await database.measurement
    .where('[crew_id+metric_id+mission_day]')
    .between([crewId, metricId, Dexie.minKey], [crewId, metricId, Dexie.maxKey]).toArray();
  if (context === undefined) return rows;
  const metric = (await database.metric.get(metricId)) ?? { default_context: null };
  return rows.filter((m) => contextOf(m, metric) === context);
}

/**
 * The most recent reading of one metric for one person (by mission day, then time taken),
 * or null when there is none. Pass `context` to look only at readings of that context.
 */
export async function getLatestMeasurement(
  crewId: number, metricId: MetricId, database: VitalisDB = defaultDb, context?: Context,
): Promise<Measurement | null> {
  const rows = await getMeasurements(crewId, metricId, database, context);
  return rows.sort(byTime)[rows.length - 1] ?? null;
}

/** Open alerts of one person (level, priority and |z| ordering is done by the caller). */
export async function getOpenAlerts(crewId: number, database: VitalisDB = defaultDb): Promise<Alert[]> {
  return database.alert.where('crew_id').equals(crewId).filter((a) => a.status === 'open').toArray();
}

export function getActions(crewId: number, database: VitalisDB = defaultDb): Promise<ActionLog[]> {
  return database.action_log.where('crew_id').equals(crewId).toArray();
}
