// src/data/queries.ts
// Small read helpers so screens never touch Dexie directly.
// Screens call these; the engine (src/engine) never imports from here.

import Dexie from 'dexie';
import { db as defaultDb, type VitalisDB } from './db';
import type { ActionLog, Alert, CrewMember, Measurement, MetricId, RadiationDose } from './types';

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

/** Readings of one metric for one person, oldest first. */
export function getMeasurements(
  crewId: number, metricId: MetricId, database: VitalisDB = defaultDb,
): Promise<Measurement[]> {
  return database.measurement
    .where('[crew_id+metric_id+mission_day]')
    .between([crewId, metricId, Dexie.minKey], [crewId, metricId, Dexie.maxKey]).toArray();
}

/** Open alerts of one person (level, priority and |z| ordering is done by the caller). */
export async function getOpenAlerts(crewId: number, database: VitalisDB = defaultDb): Promise<Alert[]> {
  return database.alert.where('crew_id').equals(crewId).filter((a) => a.status === 'open').toArray();
}

export function getActions(crewId: number, database: VitalisDB = defaultDb): Promise<ActionLog[]> {
  return database.action_log.where('crew_id').equals(crewId).toArray();
}
