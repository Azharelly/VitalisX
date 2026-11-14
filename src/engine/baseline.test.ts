import { describe, expect, it } from 'vitest';
import type { Measurement, Metric } from '../data/types';
import {
    MIN_BASELINE_DAYS,
    Z_CLAMP,
    computeBaseline,
    effectiveContext,
    mad,
    median,
    robustZ,
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

describe('median and mad', () => {
    it('median of odd and even lists', () => {
        expect(median([1, 3, 2])).toBe(2);
        expect(median([1, 2, 3, 4])).toBe(2.5);
    });
    it('mad ignores a big outlier', () => {
        expect(mad([1, 2, 3, 4, 100])).toBe(1);
    });
});

describe('computeBaseline', () => {
    it('computes median and sd = 1.4826 x MAD', () => {
        // 7 days of 7 h and 7 days of 8 h: median 7.5, MAD 0.5
        const b = computeBaseline(series(14, (d) => (d % 2 === 0 ? 8 : 7)), metric, null, 14);
        expect(b).not.toBeNull();
        expect(b!.median).toBe(7.5);
        expect(b!.sd).toBeCloseTo(0.7413, 4);
        expect(b!.n).toBe(14);
    });

    it('uses the min_sd floor when MAD = 0 (flat series)', () => {
        const b = computeBaseline(series(14, () => 7), metric, null, 14)!;
        expect(b.sd).toBe(0.2);
        expect(Number.isFinite(robustZ(7.6, b))).toBe(true);
        expect(robustZ(7.6, b)).toBeCloseTo(3);
    });

    it('is not robust-broken by one outlier', () => {
        const readings = series(14, (d) => (d === 5 ? 20 : 7));
        const b = computeBaseline(readings, metric, null, 14)!;
        expect(b.median).toBe(7);
    });

    it('returns null while learning (fewer than 14 distinct days)', () => {
        expect(computeBaseline(series(MIN_BASELINE_DAYS - 1, () => 7), metric, null, 14)).toBeNull();
        expect(computeBaseline(series(MIN_BASELINE_DAYS, () => 7), metric, null, 14)).not.toBeNull();
    });

    it('only looks at the last 28 days', () => {
        const readings = series(14, () => 7); // days 1..14
        expect(computeBaseline(readings, metric, null, 28)).not.toBeNull(); // window 1..28
        expect(computeBaseline(readings, metric, null, 29)).toBeNull(); // window 2..29, only 13 days
        expect(computeBaseline(readings, metric, null, 14)).not.toBeNull();
    });

    it('ignores readings after asOfDay', () => {
        const readings = series(20, () => 7);
        expect(computeBaseline(readings, metric, null, 13)).toBeNull(); // only 13 days up to day 13
    });

    it('keeps only readings of the same context', () => {
        const fasting = series(14, () => 7, { context: 'fasting' });
        const afterMeal = series(14, () => 9, { context: 'after_meal' });
        const all = [...fasting, ...afterMeal];
        expect(computeBaseline(all, metric, 'fasting', 14)!.median).toBe(7);
        expect(computeBaseline(all, metric, 'after_meal', 14)!.median).toBe(9);
        expect(computeBaseline(all, metric, 'resting', 14)).toBeNull();
    });

    it('a reading without context counts as the metric default context', () => {
        const withDefault: Metric = { ...metric, default_context: 'resting' };
        const readings = series(14, () => 7); // context null
        expect(effectiveContext(readings[0], withDefault)).toBe('resting');
        expect(computeBaseline(readings, withDefault, 'resting', 14)).not.toBeNull();
        expect(computeBaseline(readings, withDefault, 'fasting', 14)).toBeNull();
    });

    it('counts one reading per day: the last one by taken_at', () => {
        const readings = series(14, () => 7);
        // day 1 gets an earlier outlier; the later reading is placed first in the array
        const later = reading(1, 7, { taken_at: '2031-01-01T08:00:00' });
        const earlier = reading(1, 100, { taken_at: '2031-01-01T06:00:00' });
        const b = computeBaseline([later, earlier, ...readings.slice(1)], metric, null, 14)!;
        expect(b.n).toBe(14);
        expect(b.median).toBe(7);
    });

    it('returns null when the metric has no usable min_sd', () => {
        const readings = series(14, () => 7);
        expect(computeBaseline(readings, { ...metric, min_sd: null }, null, 14)).toBeNull();
        expect(computeBaseline(readings, { ...metric, min_sd: 0 }, null, 14)).toBeNull();
    });
});

describe('robustZ', () => {
    it('matches the PRD sleep example: (5.9 - 7.1) / 0.5 = -2.4', () => {
        expect(robustZ(5.9, { median: 7.1, sd: 0.5, n: 20 })).toBeCloseTo(-2.4);
    });

    it('clamps to +-10', () => {
        const b = { median: 7, sd: 0.2, n: 14 };
        expect(robustZ(100, b)).toBe(Z_CLAMP);
        expect(robustZ(-100, b)).toBe(-Z_CLAMP);
    });
});