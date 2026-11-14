// src/engine/evaluate.ts
// evaluate(): the state of ONE metric for ONE person (PRD 5.1 and 5.2).
// Pure: no React, no IndexedDB, no network. The caller passes in the metric and the readings.
// Radiation is not handled here: see evaluateRadiation() in radiation.ts.
//
// Order of the rules (the first that applies wins):
//   1. No usable reading                                   -> none
//   2. Outside the metric's absolute limits                -> alert   (even while learning)
//   3. Rule-only metric (symptoms, vision, exercise)       -> fixed rules, see below
//   4. Fewer than 14 same-context readings in 28 days      -> learn
//   5. |z| >= 3 in the bad direction                       -> alert
//   6. Last 3 readings all >= 1.5 in the bad direction     -> watch   (and no more than 3 days apart)
//   7. Otherwise                                           -> ok

import type { Measurement, Metric, MetricEval, State } from '../data/types';
import {
  BASELINE_DAYS, MIN_BASELINE_POINTS, baselineWindow, byTime, computeBaseline, contextOf, zScore,
} from './baseline';

// ---------- constants ----------

/** Alert when a reading is this many usual-variations from the person's median (bad direction). */
export const ALERT_Z = 3;
/** Watch when this many readings in a row are at least WATCH_Z away (bad direction). */
export const WATCH_Z = 1.5;
export const WATCH_RUN = 3;
/** The run of readings must be "in a row": no more than this many mission days between neighbours. */
export const WATCH_MAX_GAP_DAYS = 3;

/** Exercise: sessions in the last 7 days. Plan is 6; fewer than 4 (3 or more missed) = Watch. */
export const EXERCISE_WINDOW_DAYS = 7;
export const EXERCISE_PLAN = 6;
export const EXERCISE_WATCH_BELOW = 4;

// ---------- input ----------

export interface EvaluateOptions {
  /**
   * Judge the person as of this mission day: later readings are ignored. Omit for "now"
   * (the newest reading). Lets Today show a past day and the week grid reuse the same rules.
   */
  asOfDay?: number;
}

// ---------- wording ----------

const withUnit = (metric: Metric, v: number) =>
  `${v.toFixed(metric.decimals)}${metric.unit ? ` ${metric.unit}` : ''}`;

const result = (state: State, value: number | null, rule: string | null, extra: Partial<MetricEval> = {}): MetricEval => ({
  state, value, z: null, baseline: null, rule, ...extra,
});

// ---------- the rules ----------

/** Rule 2: the metric's own hard limits (abs_low / abs_high). null = inside the limits. */
function absBreach(metric: Metric, value: number): string | null {
  const low = metric.abs_low !== null && value < metric.abs_low;
  const high = metric.abs_high !== null && value > metric.abs_high;
  if (!low && !high) return null;
  // abs_rule is the plain-language wording kept with the metric, e.g. "Fever from 38.0".
  return metric.abs_rule ?? `${metric.label} ${withUnit(metric, value)} is ${low ? 'below' : 'above'} the safe limit of ${withUnit(metric, (low ? metric.abs_low : metric.abs_high) as number)}.`;
}

/** Rule 3: metrics with no personal band. The rules are fixed and live here ("soft rules stay in code"). */
function evaluateRuleOnly(metric: Metric, usable: Measurement[], current: Measurement): MetricEval {
  switch (metric.id) {
    case 'symptoms':
    case 'vision': {
      // Severity 0 to 3 as the person reports it: 0 fine, 1 to 2 Watch, 3 Alert.
      const v = current.value;
      const what = metric.id === 'vision' ? 'Vision problem' : 'Symptoms';
      if (v >= 3) return result('alert', v, `${what} reported at the highest level (3 of 3).`);
      if (v >= 1) return result('watch', v, `${what} reported (${v} of 3).`);
      return result('ok', v, null);
    }
    case 'exercise': {
      // Each logged day with a value above 0 is one session. Judged over the last 7 days.
      const from = current.mission_day - (EXERCISE_WINDOW_DAYS - 1);
      const sessions = new Set(
        usable.filter((m) => m.mission_day >= from && m.mission_day <= current.mission_day && m.value > 0).map((m) => m.mission_day),
      ).size;
      // A full week of history is needed before a low count means anything.
      if (usable[0].mission_day > from) {
        return result('learn', sessions, `Learning your normal: ${EXERCISE_WINDOW_DAYS} days of exercise log needed.`);
      }
      return sessions < EXERCISE_WATCH_BELOW
        ? result('watch', sessions, `${sessions} exercise sessions in the last ${EXERCISE_WINDOW_DAYS} days (plan is ${EXERCISE_PLAN}).`)
        : result('ok', sessions, null);
    }
    default:
      // e.g. rad_projection: another engine owns it. Never guess a state for a metric we have no rule for.
      return result('none', current.value, `No evaluation rule for "${metric.id}" in evaluate().`);
  }
}

/** Is a reading this far from the median in the BAD direction? Returns the "bad z" (positive = worse). */
function badZ(metric: Metric, z: number): number {
  if (metric.direction === 'high_is_bad') return z;
  if (metric.direction === 'low_is_bad') return -z;
  return Math.abs(z);   // 'both'
}

// ---------- evaluate ----------

/**
 * State of one metric for one person.
 *
 * @param metric    the metric's definition (limits, direction, floor for the spread, default context)
 * @param readings  readings of THIS person, any order. Readings of other metrics are ignored.
 *                  Readings of more than one person are a mistake and throw.
 * @returns state, the value judged, its z, the baseline used, and the rule that fired in plain language.
 */
export function evaluate(metric: Metric, readings: Measurement[], options: EvaluateOptions = {}): MetricEval {
  const { asOfDay } = options;
  const own = readings.filter((r) => r.metric_id === metric.id);
  if (new Set(own.map((r) => r.crew_id)).size > 1) {
    throw new Error('evaluate(): readings belong to more than one crew member. Filter by crew_id first.');
  }

  // Rule 1: the newest usable reading is the one we judge.
  const usable = own
    .filter((r) => Number.isFinite(r.value) && (asOfDay === undefined || r.mission_day <= asOfDay))
    .sort(byTime);
  const current = usable[usable.length - 1];
  if (!current) return result('none', null, null);
  const value = current.value;

  // Rule 2: a hard limit beats everything, including "still learning".
  const breach = absBreach(metric, value);
  if (breach !== null) return result('alert', value, breach);

  // Rule 3
  if (metric.direction === 'rule_only') return evaluateRuleOnly(metric, usable, current);

  // Rule 4: not enough history of the same kind to know this person's normal.
  const window = baselineWindow(usable, metric, current);
  const baseline = computeBaseline(window.map((m) => m.value), metric.min_sd);
  if (baseline === null) {
    return result('learn', value, `Learning your normal: ${window.length} of ${MIN_BASELINE_POINTS} readings so far (last ${BASELINE_DAYS} days).`);
  }

  const z = zScore(value, baseline);
  const usual = withUnit(metric, baseline.median);
  const extra = { z, baseline };

  // Rule 5
  if (badZ(metric, z) >= ALERT_Z) {
    return result('alert', value, `${metric.label} is ${Math.abs(z).toFixed(1)} times your usual variation ${z > 0 ? 'above' : 'below'} your normal of ${usual} (Alert from ${ALERT_Z}).`, extra);
  }

  // Rule 6: the last 3 same-context readings, close together in time, all clearly off.
  const ctx = contextOf(current, metric);
  const run = usable.filter((m) => contextOf(m, metric) === ctx).slice(-WATCH_RUN);
  const inARow = run.length === WATCH_RUN && run.every((m, i) => i === 0 || m.mission_day - run[i - 1].mission_day <= WATCH_MAX_GAP_DAYS);
  if (inARow) {
    const zs = run.map((m) => zScore(m.value, baseline));
    if (zs.every((x) => badZ(metric, x) >= WATCH_Z)) {
      const side = zs.every((x) => x > 0) ? 'above' : zs.every((x) => x < 0) ? 'below' : 'away from';
      return result('watch', value, `${metric.label} has been ${side} your usual of ${usual} on ${WATCH_RUN} readings in a row (each at least ${WATCH_Z} times your usual variation).`, extra);
    }
  }

  // Rule 7
  return result('ok', value, null, extra);
}
