// Personal baseline and robust z-score (PRD 5.1). Pure functions: no React, no Dexie.
// Pass readings of ONE person and ONE metric.
import type { Baseline, Context, Measurement, Metric } from '../data/types';

export const WINDOW_DAYS = 28;
export const MIN_BASELINE_DAYS = 14;
export const Z_CLAMP = 10;
const MAD_TO_SD = 1.4826;

export function median(values: number[]): number {
    if (values.length === 0) return NaN;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function mad(values: number[], center: number = median(values)): number {
    return median(values.map((v) => Math.abs(v - center)));
}

// A reading without context uses the metric's default context.
export function effectiveContext(m: Measurement, metric: Metric): Context | null {
    return m.context ?? metric.default_context;
}

// Baseline over the last 28 mission days (asOfDay included), same context only.
// One reading per day (the last by taken_at). Returns null while learning
// (< 14 distinct days) or when the metric has no min_sd (rule-only metrics).
export function computeBaseline(
    readings: Measurement[],
    metric: Metric,
    context: Context | null,
    asOfDay: number,
): Baseline | null {
    if (metric.min_sd === null || !(metric.min_sd > 0)) return null;
    const firstDay = asOfDay - WINDOW_DAYS + 1;
    const lastPerDay = new Map<number, Measurement>();
    for (const m of readings) {
        if (m.mission_day < firstDay || m.mission_day > asOfDay) continue;
        if (effectiveContext(m, metric) !== context) continue;
        const prev = lastPerDay.get(m.mission_day);
        if (!prev || m.taken_at > prev.taken_at) lastPerDay.set(m.mission_day, m);
    }
    if (lastPerDay.size < MIN_BASELINE_DAYS) return null;
    const values = [...lastPerDay.values()].map((m) => m.value);
    const med = median(values);
    const sd = Math.max(MAD_TO_SD * mad(values, med), metric.min_sd);
    return { median: med, sd, n: values.length };
}

// z = (value - median) / sd, clamped to +-10. sd is never 0 (floored by min_sd).
export function robustZ(value: number, baseline: Baseline): number {
    const z = (value - baseline.median) / baseline.sd;
    return Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z));
}