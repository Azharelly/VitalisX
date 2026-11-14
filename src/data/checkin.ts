// src/data/checkin.ts
// saveCheckIn(): the ONE call the check-in screen makes. It saves today's answers (one reading per
// metric) and runs recompute() for each, so alerts open, update or resolve in step with the data.
// Radiation is not part of a check-in: it is calculated on read from the dose log.

import { db as defaultDb, type VitalisDB } from './db';
import { recompute, type RecomputeResult } from './recompute';
import type { Context, MetricId } from './types';

/** Metrics a person can answer in the check-in. `rad_projection` is not one of them. */
export type CheckInMetricId = Exclude<MetricId, 'rad_projection'>;

export interface CheckInAnswer {
  value: number;
  /** Leave out to use the metric's default context. */
  context?: Context | null;
}

export type CheckInAnswers = Partial<Record<CheckInMetricId, CheckInAnswer>>;

export interface CheckInResult {
  /** One result per metric that was saved, in the order they were saved. */
  results: { metric_id: CheckInMetricId; result: RecomputeResult }[];
  /** Metrics whose alert changed (opened, escalated or resolved): what the UI should tell the person. */
  changed: { metric_id: CheckInMetricId; result: RecomputeResult }[];
  /** Answers skipped because the value was not a finite number. */
  skipped: CheckInMetricId[];
}

/**
 * Saves a check-in.
 * @param takenAt ISO date-time of the check-in. If the person already checked in on the mission day,
 * the existing check-in timestamp is reused so a second timestamp cannot create another check-in.
 * @param missionDay mission day of the check-in.
 */
export async function saveCheckIn(
  crewId: number,
  answers: CheckInAnswers,
  takenAt: string,
  missionDay: number,
  database: VitalisDB = defaultDb,
): Promise<CheckInResult> {
  const out: CheckInResult = { results: [], changed: [], skipped: [] };
  const existingCheckIn = await database.measurement.where('crew_id').equals(crewId)
    .filter((m) => m.mission_day === missionDay && m.source === 'checkin').toArray();
  const existingTakenAt = existingCheckIn.reduce<string | undefined>(
    (latest, measurement) => latest === undefined || measurement.taken_at > latest ? measurement.taken_at : latest,
    undefined,
  );
  const checkInTakenAt = existingTakenAt ?? takenAt;
  for (const [metric, answer] of Object.entries(answers) as [CheckInMetricId, CheckInAnswer | undefined][]) {
    if (!answer) continue;
    if (!Number.isFinite(answer.value)) { out.skipped.push(metric); continue; }
    const result = await recompute(crewId, metric, [{
      mission_day: missionDay, taken_at: checkInTakenAt, context: answer.context ?? null,
      value: answer.value, source: 'checkin', is_simulated: false,
    }], database);
    const entry = { metric_id: metric, result };
    out.results.push(entry);
    if (result.change !== 'unchanged' && result.change !== 'updated') out.changed.push(entry);
  }
  return out;
}
