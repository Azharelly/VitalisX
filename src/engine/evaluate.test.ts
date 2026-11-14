import { describe, it, expect } from 'vitest';
import type { Context, Measurement, Metric, MetricId } from '../data/types';
import {
  BASELINE_DAYS, MIN_BASELINE_POINTS, Z_CAP, baselineWindow, computeBaseline, contextOf, median, zScore,
} from './baseline';
import { evaluate } from './evaluate';

// ---------- helpers ----------

const metric = (o: Partial<Metric> = {}): Metric => ({
  id: 'hr', label: 'Resting heart rate', unit: 'bpm', zone: 'heart', direction: 'both',
  min_sd: 2, abs_low: null, abs_high: null, abs_rule: null, default_context: 'resting',
  decimals: 0, priority: 3, source_ids: [], ...o,
});

let nextId = 1;
const reading = (day: number, value: number, o: Partial<Measurement> = {}): Measurement => ({
  id: nextId++, crew_id: 1, metric_id: 'hr', mission_day: day,
  taken_at: new Date(Date.UTC(2031, 0, day, 8)).toISOString(),
  context: null, value, source: 'checkin', is_simulated: true, ...o,
});

/** `n` readings on days 1..n cycling 64, 65, 66: median 65, MAD 1. With min_sd 2 the spread is 2. */
const steady = (n: number, o: Partial<Measurement> = {}) =>
  Array.from({ length: n }, (_, i) => reading(i + 1, 65 + ((i % 3) - 1), o));

// With the helpers above: median 65 and sd 2, so  z = (value - 65) / 2
//   Watch from 1.5 -> 68 or 62     Alert from 3 -> 71 or 59

// ---------- baseline.ts ----------

describe('median', () => {
  it('odd and even length, unsorted, input untouched', () => {
    const xs = [5, 1, 3];
    expect(median(xs)).toBe(3);
    expect(xs).toEqual([5, 1, 3]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('computeBaseline', () => {
  it('is null while learning (fewer than 14 values)', () => {
    expect(computeBaseline(Array(MIN_BASELINE_POINTS - 1).fill(65), 2)).toBeNull();
  });
  it('gives median, spread and n at 14 values', () => {
    const b = computeBaseline(steady(14).map((m) => m.value), 2);
    expect(b).toEqual({ median: 65, sd: 2, n: 14 });
  });
  it('sd = 1.4826 x MAD when that is above min_sd', () => {
    const vals = [...Array(7).fill(60), ...Array(7).fill(70)];   // median 65, MAD 5
    expect(computeBaseline(vals, 2)?.sd).toBeCloseTo(1.4826 * 5, 6);
  });
  it('sd never goes below min_sd', () => {
    expect(computeBaseline(Array(14).fill(65), 2)?.sd).toBe(2);
  });
  it('a null min_sd means no floor', () => {
    expect(computeBaseline(Array(14).fill(65), null)?.sd).toBe(0);
  });
  it('one wild value barely moves it (robust)', () => {
    const b = computeBaseline([...Array(13).fill(65), 200], 2);
    expect(b?.median).toBe(65);
    expect(b?.sd).toBe(2);
  });
});

describe('zScore', () => {
  const b = { median: 65, sd: 2, n: 14 };
  it('is signed distance in spreads', () => {
    expect(zScore(71, b)).toBe(3);
    expect(zScore(61, b)).toBe(-2);
    expect(zScore(65, b)).toBe(0);
  });
  it('is clamped to +/- 10', () => {
    expect(zScore(1000, b)).toBe(Z_CAP);
    expect(zScore(-1000, b)).toBe(-Z_CAP);
  });
  it('a flat history (spread 0) never divides by zero', () => {
    const flat = { median: 65, sd: 0, n: 14 };
    expect(zScore(65, flat)).toBe(0);
    expect(zScore(66, flat)).toBe(Z_CAP);
    expect(zScore(64, flat)).toBe(-Z_CAP);
  });
});

describe('contextOf / baselineWindow', () => {
  const m = metric();
  it('a reading without context counts under the metric default', () => {
    expect(contextOf(reading(1, 65), m)).toBe('resting');
    expect(contextOf(reading(1, 65, { context: 'after_exercise' }), m)).toBe('after_exercise');
    expect(contextOf(reading(1, 65), metric({ default_context: null }))).toBeNull();
  });
  it('keeps only same-context readings from the 28 days before, never the reading itself', () => {
    const current = reading(40, 70);
    const w = baselineWindow([
      reading(11, 65),                                         // 29 days back: too old
      reading(12, 65),                                         // 28 days back: in
      reading(39, 65),                                         // in
      reading(39, 99, { context: 'after_exercise' }),          // other context: out
      reading(41, 65),                                         // later: out
      current,                                                 // itself: out
    ], m, current);
    expect(w.map((x) => x.mission_day)).toEqual([12, 39]);
    expect(BASELINE_DAYS).toBe(28);
  });
  it('a reading earlier the same day is in the baseline, a later one is not', () => {
    const current = reading(5, 70, { taken_at: '2031-01-05T12:00:00Z' });
    const earlier = reading(5, 65, { taken_at: '2031-01-05T08:00:00Z' });
    const later = reading(5, 65, { taken_at: '2031-01-05T18:00:00Z' });
    expect(baselineWindow([earlier, later, current], m, current)).toEqual([earlier]);
  });
});

// ---------- evaluate(): rule 1, nothing to judge ----------

describe('evaluate: no data', () => {
  it('no readings -> none', () => {
    expect(evaluate(metric(), [])).toEqual({ state: 'none', value: null, z: null, baseline: null, rule: null });
  });
  it('readings of other metrics are ignored', () => {
    expect(evaluate(metric(), [reading(1, 70, { metric_id: 'temp' as MetricId })]).state).toBe('none');
  });
  it('non-finite values are ignored', () => {
    expect(evaluate(metric(), [reading(1, NaN)]).state).toBe('none');
  });
  it('readings of two people are refused, not silently mixed', () => {
    expect(() => evaluate(metric(), [reading(1, 65), reading(2, 65, { crew_id: 2 })])).toThrow(/more than one crew member/);
  });
});

// ---------- rule 2: absolute limits ----------

describe('evaluate: absolute limits', () => {
  const temp = metric({ id: 'temp', label: 'Temperature', unit: '°C', direction: 'high_is_bad', min_sd: 0.15, abs_high: 37.9, abs_rule: 'Fever from 38.0', default_context: 'resting', decimals: 1 });
  const t = (day: number, v: number) => reading(day, v, { metric_id: 'temp' });

  it('alert above abs_high, using the metric wording, even with a single reading (still learning)', () => {
    const r = evaluate(temp, [t(1, 38.2)]);
    expect(r).toMatchObject({ state: 'alert', value: 38.2, rule: 'Fever from 38.0', z: null, baseline: null });
  });
  it('exactly at the limit is not a breach', () => {
    expect(evaluate(temp, [t(1, 37.9)]).state).toBe('learn');
  });
  it('alert below abs_low, with generated wording when abs_rule is missing', () => {
    const spo2 = metric({ id: 'spo2', label: 'SpO₂', unit: '%', direction: 'low_is_bad', abs_low: 92 });
    const r = evaluate(spo2, [reading(1, 90, { metric_id: 'spo2' })]);
    expect(r.state).toBe('alert');
    expect(r.rule).toBe('SpO₂ 90 % is below the safe limit of 92 %.');
  });
  it('a hard limit beats a normal z', () => {
    const history = Array.from({ length: 14 }, (_, i) => t(i + 1, 38.0));   // person runs "hot": 38.0 is their normal
    const r = evaluate(temp, [...history, t(15, 38.0)]);
    expect(r.state).toBe('alert');
    expect(r.z).toBeNull();            // decided by the limit, not by the baseline
  });
});

// ---------- rule 4: learning ----------

describe('evaluate: learning your normal', () => {
  it('13 earlier readings + today = still learning, says how far along', () => {
    const r = evaluate(metric(), [...steady(13), reading(14, 66)]);
    expect(r).toMatchObject({ state: 'learn', value: 66, z: null, baseline: null });
    expect(r.rule).toMatch(/13 of 14/);
  });
  it('14 earlier readings = baseline exists', () => {
    const r = evaluate(metric(), [...steady(14), reading(15, 66)]);
    expect(r.state).toBe('ok');
    expect(r.baseline?.n).toBe(14);
  });
  it('readings in another context do not count toward the baseline', () => {
    // 14 resting readings, but today is after exercise: nothing to compare with yet.
    const r = evaluate(metric(), [...steady(14), reading(15, 90, { context: 'after_exercise' })]);
    expect(r.state).toBe('learn');
    expect(r.rule).toMatch(/0 of 14/);
  });
  it('readings older than 28 days do not count', () => {
    const r = evaluate(metric(), [...steady(14), reading(60, 66)]);
    expect(r.state).toBe('learn');
  });
  it('null context and the default context are the same bucket', () => {
    const r = evaluate(metric(), [...steady(14), reading(15, 66, { context: 'resting' })]);
    expect(r.state).toBe('ok');
  });
});

// ---------- rules 5 to 7: the personal baseline ----------

describe('evaluate: ok, watch, alert', () => {
  const hist = () => steady(14);

  it('a normal reading is ok and carries z and the baseline', () => {
    const r = evaluate(metric(), [...hist(), reading(15, 66)]);
    expect(r).toMatchObject({ state: 'ok', value: 66, rule: null });
    expect(r.z).toBe(0.5);
    expect(r.baseline).toEqual({ median: 65, sd: 2, n: 14 });
  });

  it('the reading being judged is not part of its own baseline', () => {
    const r = evaluate(metric(), [...hist(), reading(15, 500)]);
    expect(r.baseline?.median).toBe(65);
    expect(r.state).toBe('alert');
  });

  it('alert at z >= 3, not below', () => {
    expect(evaluate(metric(), [...hist(), reading(15, 71)])).toMatchObject({ state: 'alert', z: 3 });
    expect(evaluate(metric(), [...hist(), reading(15, 70)]).state).toBe('ok');   // z 2.5 once is not enough
  });

  it('the alert wording names the metric, the side and the usual value', () => {
    const r = evaluate(metric(), [...hist(), reading(15, 59)]);
    expect(r.rule).toBe('Resting heart rate is 3.0 times your usual variation below your normal of 65 bpm (Alert from 3).');
  });

  it('watch: 3 readings in a row, each z >= 1.5', () => {
    const r = evaluate(metric(), [...hist(), reading(15, 68), reading(16, 69), reading(17, 68)]);
    expect(r.state).toBe('watch');
    expect(r.z).toBe(1.5);
    expect(r.rule).toBe('Resting heart rate has been above your usual of 65 bpm on 3 readings in a row (each at least 1.5 times your usual variation).');
  });

  it('watch needs all three: one reading just under 1.5 breaks it', () => {
    expect(evaluate(metric(), [...hist(), reading(15, 68), reading(16, 67), reading(17, 68)]).state).toBe('ok');
  });

  it('two readings are not a run', () => {
    expect(evaluate(metric(), [...hist(), reading(15, 69), reading(16, 69)]).state).toBe('ok');
  });

  it('the run must be close in time: gap of 3 days is fine, 4 is not', () => {
    expect(evaluate(metric(), [...hist(), reading(15, 69), reading(18, 69), reading(21, 69)]).state).toBe('watch');
    expect(evaluate(metric(), [...hist(), reading(15, 69), reading(19, 69), reading(23, 69)]).state).toBe('ok');
  });

  it('the run is made of same-context readings only', () => {
    // two high resting readings, then an after-exercise reading, then a high resting one
    const r = evaluate(metric(), [
      ...hist(),
      reading(15, 69), reading(16, 69),
      reading(17, 120, { context: 'after_exercise' }),
      reading(18, 69),
    ]);
    expect(r.state).toBe('watch');
  });

  it('an alert reading wins over the watch run', () => {
    expect(evaluate(metric(), [...hist(), reading(15, 69), reading(16, 69), reading(17, 72)]).state).toBe('alert');
  });

  it('input order does not matter', () => {
    const rs = [...hist(), reading(15, 68), reading(16, 69), reading(17, 68)];
    expect(evaluate(metric(), [...rs].reverse())).toEqual(evaluate(metric(), rs));
  });

  describe('direction', () => {
    const rs = (v: number) => [...hist(), reading(15, v)];
    it('high_is_bad: only high values count', () => {
      const m = metric({ direction: 'high_is_bad' });
      expect(evaluate(m, rs(72)).state).toBe('alert');
      expect(evaluate(m, rs(58)).state).toBe('ok');
    });
    it('low_is_bad: only low values count', () => {
      const m = metric({ direction: 'low_is_bad' });
      expect(evaluate(m, rs(58)).state).toBe('alert');
      expect(evaluate(m, rs(72)).state).toBe('ok');
    });
    it('both: either side counts', () => {
      expect(evaluate(metric(), rs(72)).state).toBe('alert');
      expect(evaluate(metric(), rs(58)).state).toBe('alert');
    });
    it('"both" with a run on opposite sides says "away from", not above or below', () => {
      const r = evaluate(metric(), [...hist(), reading(15, 69), reading(16, 61), reading(17, 69)]);
      expect(r.state).toBe('watch');
      expect(r.rule).toMatch(/away from your usual/);
    });
  });

  describe('a perfectly flat history', () => {
    const flat = Array.from({ length: 14 }, (_, i) => reading(i + 1, 65));
    it('with no min_sd any change is the biggest z, never a crash', () => {
      const m = metric({ min_sd: null });
      expect(evaluate(m, [...flat, reading(15, 66)])).toMatchObject({ state: 'alert', z: Z_CAP });
      expect(evaluate(m, [...flat, reading(15, 65)])).toMatchObject({ state: 'ok', z: 0 });
    });
    it('with a min_sd a small change stays ok', () => {
      expect(evaluate(metric(), [...flat, reading(15, 66)]).state).toBe('ok');
    });
  });
});

// ---------- as of a past day ----------

describe('evaluate: asOfDay', () => {
  const rs = [...steady(14), reading(15, 66), reading(16, 72)];
  it('judges the newest reading by default', () => {
    expect(evaluate(metric(), rs)).toMatchObject({ state: 'alert', value: 72 });
  });
  it('ignores readings after the given day', () => {
    expect(evaluate(metric(), rs, { asOfDay: 15 })).toMatchObject({ state: 'ok', value: 66 });
  });
  it('before any reading -> none', () => {
    expect(evaluate(metric(), rs, { asOfDay: 0 }).state).toBe('none');
  });
});

// ---------- the dossier stories (PRD 5, Today README) ----------

describe('stories', () => {
  it('Ravi: temperature climbs; Alert by z at 37.5, then by the fever limit at 38.2', () => {
    const temp = metric({ id: 'temp', label: 'Temperature', unit: '°C', direction: 'high_is_bad', min_sd: 0.15, abs_high: 37.9, abs_rule: 'Fever from 38.0', decimals: 1 });
    const vals = [36.9, 36.95, 37.0];
    const base = Array.from({ length: 20 }, (_, i) => reading(i + 120, vals[i % 3], { metric_id: 'temp' }));
    const t = (day: number, v: number) => reading(day, v, { metric_id: 'temp' });
    expect(evaluate(temp, [...base, t(140, 37.1)]).state).toBe('ok');
    const d141 = evaluate(temp, [...base, t(140, 37.1), t(141, 37.5)]);
    expect(d141.state).toBe('alert');
    expect(d141.z).toBeGreaterThan(3);
    expect(d141.rule).toMatch(/above your normal/);
    expect(evaluate(temp, [...base, t(140, 37.1), t(141, 37.5), t(142, 38.2)]).rule).toBe('Fever from 38.0');
  });

  it('Amara: sleep slips three nights in a row -> Watch, not Alert', () => {
    const sleep = metric({ id: 'sleep', label: 'Sleep', unit: 'h', direction: 'low_is_bad', min_sd: 0.25, default_context: null, decimals: 1 });
    const vals = [6.4, 6.5, 6.6];
    const base = Array.from({ length: 20 }, (_, i) => reading(i + 1, vals[i % 3], { metric_id: 'sleep' }));
    const s = (day: number, v: number) => reading(day, v, { metric_id: 'sleep' });
    const r = evaluate(sleep, [...base, s(21, 6.0), s(22, 5.9), s(23, 5.8)]);
    expect(r.state).toBe('watch');
    expect(r.rule).toMatch(/below your usual of 6\.5 h/);
  });
});

// ---------- rule 3: rule-only metrics ----------

describe('evaluate: symptoms and vision (severity 0 to 3)', () => {
  const sym = metric({ id: 'symptoms', label: 'Symptoms', unit: '/3', direction: 'rule_only', min_sd: null, abs_high: null, default_context: null });
  const vis = metric({ id: 'vision', label: 'Vision self-check', unit: '/3', direction: 'rule_only', min_sd: null, default_context: null });
  const r = (m: Metric, v: number) => evaluate(m, [reading(1, v, { metric_id: m.id })]);

  it('0 ok, 1-2 watch, 3 alert', () => {
    expect([0, 1, 2, 3].map((v) => r(sym, v).state)).toEqual(['ok', 'watch', 'watch', 'alert']);
    expect([0, 1, 2, 3].map((v) => r(vis, v).state)).toEqual(['ok', 'watch', 'watch', 'alert']);
  });
  it('no personal baseline: z and baseline stay null, even with a short history', () => {
    expect(r(sym, 2)).toMatchObject({ z: null, baseline: null, value: 2 });
  });
  it('wording names what was reported', () => {
    expect(r(vis, 1).rule).toBe('Vision problem reported (1 of 3).');
    expect(r(sym, 3).rule).toBe('Symptoms reported at the highest level (3 of 3).');
  });
  it('judges the newest reading', () => {
    const m = sym;
    expect(evaluate(m, [reading(1, 3, { metric_id: 'symptoms' }), reading(2, 0, { metric_id: 'symptoms' })]).state).toBe('ok');
  });
});

describe('evaluate: exercise (sessions in the last 7 days)', () => {
  const ex = metric({ id: 'exercise', label: 'Exercise', unit: 'sessions', direction: 'rule_only', min_sd: null, default_context: null });
  const e = (day: number, v = 1) => reading(day, v, { metric_id: 'exercise' });
  /** Logs for days 1..20, with a session (value 1) only on the listed days; the rest are logged as 0. */
  const log = (sessionDays: number[]) => Array.from({ length: 20 }, (_, i) => e(i + 1, sessionDays.includes(i + 1) ? 1 : 0));

  it('4 sessions in 7 days is ok, 3 is Watch (3 missed of 6 planned)', () => {
    const ok = evaluate(ex, log([14, 16, 18, 20]));          // days 14..20
    expect(ok).toMatchObject({ state: 'ok', value: 4 });
    const low = evaluate(ex, log([14, 16, 20]));
    expect(low).toMatchObject({ state: 'watch', value: 3 });
    expect(low.rule).toBe('3 exercise sessions in the last 7 days (plan is 6).');
  });
  it('only the last 7 days count', () => {
    expect(evaluate(ex, log([1, 2, 3, 4, 5, 6, 20])).value).toBe(1);
  });
  it('less than a week of log = learning', () => {
    expect(evaluate(ex, [e(1), e(2), e(3)]).state).toBe('learn');
  });
  it('days with value 0 are not sessions', () => {
    expect(evaluate(ex, log([])).value).toBe(0);
  });
});

describe('evaluate: metrics it has no rule for', () => {
  it('rad_projection is the radiation engine\'s job: none, with a reason, never a guess', () => {
    const rad = metric({ id: 'rad_projection', direction: 'rule_only', zone: 'radiation' as Metric['zone'] });
    const r = evaluate(rad, [reading(1, 400, { metric_id: 'rad_projection' })]);
    expect(r).toMatchObject({ state: 'none', value: 400 });
    expect(r.rule).toMatch(/rad_projection/);
  });
});

// make sure Context stays imported for type use in future edits
export type _ContextCheck = Context;
