// src/engine/baseline.test.ts
import { describe, expect, it } from 'vitest';
import type { Measurement, Metric } from '../data/types';
import {
    BASELINE_DAYS,
    MIN_BASELINE_POINTS,
    Z_CAP,
    baselineWindow,
    computeBaseline,
    contextOf,
    median,
    zScore,
} from './baseline';

const metric: Metric = {
    id: 'sleep', label: 'Sleep', unit: 'h', zone: 'mind', direction: 'low_is_bad',
    min_sd: 0.2, abs_low: null, abs_high: null, abs_rule: null,
    default_context: null, decimals: 1, priority: 8, source_ids: [],
};

let nextId = 1;
function reading(day: number, value: number, extra: Partial<Measurement> = {}): Measurement {
    return {
        id: nextId++, crew_id: 1, metric_id: 'sleep', mission_day: day,
        taken_at: '2031-01-01T08:00:00', context: null, value,
        source: 'checkin', is_simulated: true, ...extra,
    };
}

// one reading per day, days 1..n
function series(n: number, value: (day: number) => number, extra: Partial<Measurement> = {}) {
    return Array.from({ length: n }, (_, i) => reading(i + 1, value(i + 1), extra));
}

const flat = (n: number, v = 7) => Array.from({ length: n }, () => v);

describe('median', () => {
    it('median of odd and even lists', () => {
        expect(median([1, 3, 2])).toBe(2);
        expect(median([1, 2, 3, 4])).toBe(2.5);
    });
});

describe('computeBaseline (values -> median and sd)', () => {
    it('computes median and sd = 1.4826 x MAD', () => {
        // 7 values of 7 and 7 values of 8: median 7.5, MAD 0.5
        const values = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? 8 : 7));
        const b = computeBaseline(values, 0.2)!;
        expect(b.median).toBe(7.5);
        expect(b.sd).toBeCloseTo(0.7413, 4);
        expect(b.n).toBe(14);
    });

    it('uses the min_sd floor when MAD = 0 (flat series)', () => {
        const b = computeBaseline(flat(14), 0.2)!;
        expect(b.sd).toBe(0.2);
        expect(Number.isFinite(zScore(7.6, b))).toBe(true);
        expect(zScore(7.6, b)).toBeCloseTo(3);
    });

    it('one outlier does not move the median', () => {
        const values = flat(14);
        values[4] = 20;
        expect(computeBaseline(values, 0.2)!.median).toBe(7);
    });

    it('returns null while learning (fewer than 14 values)', () => {
        expect(computeBaseline(flat(MIN_BASELINE_POINTS - 1), 0.2)).toBeNull();
        expect(computeBaseline(flat(MIN_BASELINE_POINTS), 0.2)).not.toBeNull();
    });

    it('without min_sd and a flat history, z is capped, never infinite', () => {
        const b = computeBaseline(flat(14), null)!;
        expect(b.sd).toBe(0);
        expect(zScore(7, b)).toBe(0);
        expect(zScore(8, b)).toBe(Z_CAP);
        expect(zScore(6, b)).toBe(-Z_CAP);
    });
});

describe('zScore', () => {
    it('matches the PRD sleep example: (5.9 - 7.1) / 0.5 = -2.4', () => {
        expect(zScore(5.9, { median: 7.1, sd: 0.5, n: 20 })).toBeCloseTo(-2.4);
    });

    it('clamps to +-10', () => {
        const b = { median: 7, sd: 0.2, n: 14 };
        expect(zScore(100, b)).toBe(Z_CAP);
        expect(zScore(-100, b)).toBe(-Z_CAP);
    });
});

describe('contextOf', () => {
    it('uses the reading context, or the metric default when it has none', () => {
        expect(contextOf({ context: 'fasting' }, { default_context: 'resting' })).toBe('fasting');
        expect(contextOf({ context: null }, { default_context: 'resting' })).toBe('resting');
        expect(contextOf({ context: null }, { default_context: null })).toBeNull();
    });
});

describe('baselineWindow', () => {
    it('only uses readings taken before the one being judged', () => {
        const readings = series(20, () => 7);
        const current = readings[14]; // day 15
        const w = baselineWindow(readings, metric, current);
        expect(w).toHaveLength(14);
        expect(w.every((m) => m.mission_day < 15)).toBe(true);
        expect(w.some((m) => m.id === current.id)).toBe(false);
    });

    it('looks back at most 28 mission days', () => {
        const readings = series(39, () => 7); // days 1..39
        const current = reading(40, 7);
        const w = baselineWindow([...readings, current], metric, current);
        expect(w).toHaveLength(BASELINE_DAYS);
        expect(Math.min(...w.map((m) => m.mission_day))).toBe(40 - BASELINE_DAYS);
    });

    it('keeps only readings of the same context', () => {
        const fasting = series(14, () => 7, { context: 'fasting' });
        const afterMeal = series(14, () => 9, { context: 'after_meal' });
        const current = reading(15, 7, { context: 'fasting' });
        const w = baselineWindow([...fasting, ...afterMeal, current], metric, current);
        expect(w).toHaveLength(14);
        expect(w.every((m) => m.value === 7)).toBe(true);
    });

    it('a reading without context counts as the metric default context', () => {
        const withDefault: Metric = { ...metric, default_context: 'resting' };
        const readings = series(14, () => 7); // context null -> resting
        const resting = reading(15, 7, { context: 'resting' });
        const fasting = reading(15, 7, { context: 'fasting' });
        expect(baselineWindow([...readings, resting], withDefault, resting)).toHaveLength(14);
        expect(baselineWindow([...readings, fasting], withDefault, fasting)).toHaveLength(0);
    });

    it('skips readings that are not finite numbers', () => {
        const bad = reading(1, NaN);
        const good = reading(2, 7);
        const current = reading(3, 7);
        expect(baselineWindow([bad, good, current], metric, current)).toEqual([good]);
    });
});