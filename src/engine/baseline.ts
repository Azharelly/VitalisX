// src/engine/baseline.ts
// "What is normal for THIS person?" (PRD 5.1). Pure functions: data in, numbers out.
// No React, no IndexedDB, no network. The caller passes in the readings.

import type { Baseline, Context, Measurement, Metric } from '../data/types';

// ---------- constants ----------

/** The baseline looks back this many mission days from the reading being judged. */
export const BASELINE_DAYS = 28;

/** Fewer same-context readings than this = "learning your normal": no personal judgement yet. */
export const MIN_BASELINE_POINTS = 14;

/** Turns the median absolute deviation (MAD) into the same scale as a standard deviation. */
export const MAD_TO_SD = 1.4826;

/** z is clamped to this range, so a flat history can never give an infinite z. */
export const Z_CAP = 10;

// ---------- small helpers ----------

/** Median of a NON-EMPTY list (an empty list gives NaN). Does not change its input. */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The context a reading counts under: its own, or the metric's default when it has none.
 * Readings are only compared with readings of the same context (a temperature after exercise
 * is not compared with resting temperatures).
 */
export function contextOf(
  m: Pick<Measurement, 'context'>,
  metric: Pick<Metric, 'default_context'>,
): Context | null {
  return m.context ?? metric.default_context;
}

const timeOf = (m: Measurement): number => {
  const t = Date.parse(m.taken_at);
  return Number.isNaN(t) ? 0 : t;
};

/** Oldest first: mission day, then time taken, then id. Use with Array.sort. */
export function byTime(a: Measurement, b: Measurement): number {
  return a.mission_day - b.mission_day || timeOf(a) - timeOf(b) || a.id - b.id;
}

// ---------- the baseline ----------

/**
 * The readings that make up the baseline for `current`: same context, taken BEFORE it,
 * within the last 28 mission days. `readings` must belong to one person and one metric.
 * The reading being judged is never part of its own baseline.
 */
export function baselineWindow(
  readings: Measurement[],
  metric: Pick<Metric, 'default_context'>,
  current: Measurement,
): Measurement[] {
  const ctx = contextOf(current, metric);
  return readings.filter(
    (m) =>
      m.id !== current.id &&
      Number.isFinite(m.value) &&
      contextOf(m, metric) === ctx &&
      byTime(m, current) < 0 &&
      m.mission_day >= current.mission_day - BASELINE_DAYS,
  );
}

/**
 * Median and robust spread of a list of values.
 *   median = middle value
 *   sd     = 1.4826 x MAD, never below `minSd` (so a very steady person is not hypersensitive).
 * Returns null while there are fewer than 14 values (still learning).
 */
export function computeBaseline(values: number[], minSd: number | null): Baseline | null {
  if (values.length < MIN_BASELINE_POINTS) return null;
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  return { median: med, sd: Math.max(MAD_TO_SD * mad, minSd ?? 0), n: values.length };
}

/**
 * Robust z-score: how many usual-variations `value` is from the person's median (signed).
 * If the spread is 0 (a perfectly flat history and no min_sd) any difference counts as the
 * largest z instead of dividing by zero.
 */
export function zScore(value: number, baseline: Baseline): number {
  if (baseline.sd <= 0) return value === baseline.median ? 0 : value > baseline.median ? Z_CAP : -Z_CAP;
  return Math.min(Z_CAP, Math.max(-Z_CAP, (value - baseline.median) / baseline.sd));
}
