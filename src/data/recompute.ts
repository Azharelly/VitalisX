// src/data/recompute.ts
// recompute() (issue #10): save new readings of ONE person + ONE metric, re-run evaluate(),
// and keep the alert store in step — all in a single IndexedDB transaction, so a failure
// leaves nothing half-written.
//
// Alert lifecycle (PRD 5.2: at most one open alert per person + metric):
//   watch/alert, nothing open        -> open a new alert
//   watch/alert, same level open     -> refresh it in place (raised_day kept, evidence merged)
//   watch/alert, different level     -> resolve the old one, open a new one (old row untouched otherwise)
//   ok                               -> resolve the open alert (its evidence stays as it was)
//   learn / none                     -> no change: not enough information to raise or clear
// Resolved alerts are never edited again: they are the evidence of what happened.

import { db as defaultDb, type VitalisDB } from './db';
import type { Alert, EvidencePoint, Measurement, MetricEval, MetricId } from './types';
import { evaluate } from '../engine/evaluate';
import { baselineWindow, byTime } from '../engine/baseline';

/** How many recent readings are kept as evidence on an alert (feeds the "Why?" chart). */
export const EVIDENCE_POINTS = 14;

export type NewMeasurement = Omit<Measurement, 'id' | 'crew_id' | 'metric_id'> & { id?: number };

export type RecomputeChange = 'opened' | 'updated' | 'escalated' | 'resolved' | 'unchanged';

export interface RecomputeResult {
  eval: MetricEval;
  change: RecomputeChange;
  /** The open alert after recompute, or null. */
  alert: Alert | null;
  /** Alert closed by this call (on 'resolved' or 'escalated'), or null. */
  resolved: Alert | null;
  /** Ids of the saved readings, in input order. */
  measurementIds: number[];
}

function mergeEvidence(old: EvidencePoint[], fresh: EvidencePoint[]): EvidencePoint[] {
  const byDay = new Map<number, EvidencePoint>();
  for (const p of [...old, ...fresh]) byDay.set(p.mission_day, p);
  return [...byDay.values()].sort((a, b) => a.mission_day - b.mission_day);
}

export async function recompute(
  crewId: number,
  metricId: MetricId,
  readings: NewMeasurement[] = [],
  database: VitalisDB = defaultDb,
): Promise<RecomputeResult> {
  if (metricId === 'rad_projection') {
    throw new Error('recompute(): radiation alerts are handled by evaluateRadiation(), not here.');
  }
  return database.transaction('rw', database.metric, database.measurement, database.alert, async () => {
    const metric = await database.metric.get(metricId);
    if (!metric) throw new Error(`recompute(): unknown metric "${metricId}".`);

    // 1. Save readings. Same person + metric + taken_at = a correction of that reading (keeps its id).
    const measurementIds: number[] = [];
    for (const r of readings) {
      const existing = await database.measurement
        .where('[crew_id+metric_id+taken_at]').equals([crewId, metricId, r.taken_at]).first();
      const row = { ...r, crew_id: crewId, metric_id: metricId } as Measurement;
      if (existing) row.id = existing.id; else if (r.id === undefined) delete (row as Partial<Measurement>).id;
      measurementIds.push(await database.measurement.put(row));
    }

    // 2. Evaluate on the full history.
    const all = await database.measurement
      .where('[crew_id+metric_id+mission_day]').between([crewId, metricId, -Infinity], [crewId, metricId, Infinity]).toArray();
    const ev = evaluate(metric, all);
    const usable = all.filter((m) => Number.isFinite(m.value)).sort(byTime);
    const current = usable[usable.length - 1];
    const today = current?.mission_day ?? 0;

    const open = await database.alert
      .where('[crew_id+metric_id+status]').equals([crewId, metricId, 'open']).first() ?? null;

    const resolve = async (a: Alert): Promise<Alert> => {
      const done = { ...a, status: 'resolved' as const, resolved_day: Math.max(today, a.raised_day) };
      await database.alert.update(a.id, { status: done.status, resolved_day: done.resolved_day });
      return done;
    };

    // 3. Apply the lifecycle.
    if (ev.state === 'ok') {
      if (!open) return { eval: ev, change: 'unchanged', alert: null, resolved: null, measurementIds };
      return { eval: ev, change: 'resolved', alert: null, resolved: await resolve(open), measurementIds };
    }
    if (ev.state !== 'watch' && ev.state !== 'alert') {
      return { eval: ev, change: 'unchanged', alert: open, resolved: null, measurementIds };
    }

    const window = current ? baselineWindow(usable, metric, current) : [];
    const evidence: EvidencePoint[] = [...window, ...(current ? [current] : [])]
      .slice(-EVIDENCE_POINTS).map((m) => ({ mission_day: m.mission_day, value: m.value }));
    const fields = {
      level: ev.state, rule: ev.rule, value: ev.value, z: ev.z,
      baseline_median: ev.baseline?.median ?? null, baseline_sd: ev.baseline?.sd ?? null,
    };

    if (open && open.level === ev.state) {
      const updated: Alert = { ...open, ...fields, evidence: mergeEvidence(open.evidence, evidence) };
      await database.alert.put(updated);
      return { eval: ev, change: 'updated', alert: updated, resolved: null, measurementIds };
    }

    const resolved = open ? await resolve(open) : null;
    const draft: Omit<Alert, 'id'> = {
      crew_id: crewId, metric_id: metricId, zone: metric.zone, ...fields,
      raised_day: today, resolved_day: null, status: 'open',
      evidence, is_simulated: current?.is_simulated ?? false,
    };
    const id = await database.alert.add(draft as Alert);
    return { eval: ev, change: open ? 'escalated' : 'opened', alert: { ...draft, id }, resolved, measurementIds };
  });
}
