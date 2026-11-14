// src/engine/radiation.ts
// Pure radiation logic (PRD 5.3). No React, no IndexedDB, no network.
// The caller passes in the data; this file only computes.

import type { RadiationDose, State } from '../data/types';

// ---------- constants ----------
/** Career limit. NASA-STD-3001 Vol. 1 (universal). */
export const CAREER_LIMIT_MSV = 600;

/**
 * Shielding DESIGN TARGET for a reference storm (NASA-STD-3001).
 * NEVER present this as a personal limit.
 */
export const STORM_DESIGN_TARGET_MSV = 250;

/** Rate = mean of the last N available daily doses. */
export const RATE_WINDOW_DAYS = 7;

/**
 * Watch when the arrival projection reaches this fraction of the limit.
 * [OPEN in PRD 5.3 / R-15] Proposed 0.80, confirm with the team. Our own design rule.
 */
export const WATCH_PROJECTION_FRACTION = 0.8;

/**
 * "sep_flag in the last 24 h": doses are daily, so we count today and yesterday.
 * [PROPOSED] Change to 0 if the team wants today only.
 */
export const SEP_LOOKBACK_DAYS = 1;

// ---------- basic calculations ----------

/** career_dose = prior_dose_msv + sum(daily doses). */
export function careerDose(priorDoseMsv: number, doses: RadiationDose[]): number {
  return priorDoseMsv + doses.reduce((sum, d) => sum + d.dose_msv, 0);
}

/** Fraction of the 600 mSv limit (0.89 = 89%). Can exceed 1. */
export function fractionOfLimit(careerMsv: number): number {
  return careerMsv / CAREER_LIMIT_MSV;
}

/**
 * rate = mean of the last 7 AVAILABLE daily doses (fewer if that is all there is).
 * Returns null when there is no data (nothing is computed from nothing).
 */
export function doseRate(doses: RadiationDose[]): number | null {
  if (doses.length === 0) return null;
  const last = [...doses]
    .sort((a, b) => a.mission_day - b.mission_day)
    .slice(-RATE_WINDOW_DAYS);
  return last.reduce((s, d) => s + d.dose_msv, 0) / last.length;
}

export type DaysToLimit =
  | { status: 'days'; days: number }
  | { status: 'reached' }          // career_dose >= 600: never show negative days
  | { status: 'unavailable' };     // rate missing or 0: show "—"

/** days_to_limit = (600 - career_dose) / rate, only if rate > 0. */
export function daysToLimit(careerMsv: number, rate: number | null): DaysToLimit {
  if (careerMsv >= CAREER_LIMIT_MSV) return { status: 'reached' };
  if (rate === null || rate <= 0) return { status: 'unavailable' };
  return { status: 'days', days: (CAREER_LIMIT_MSV - careerMsv) / rate };
}

/**
 * arrival_projection = career_dose + rate * (arrival_day - current_day).
 * null if there is no rate or the arrival day has already passed (not shown).
 */
export function arrivalProjection(
  careerMsv: number,
  rate: number | null,
  arrivalDay: number,
  currentDay: number,
): number | null {
  if (rate === null) return null;
  if (arrivalDay <= currentDay) return null;
  return careerMsv + rate * (arrivalDay - currentDay);
}

/** True if any dose in the lookback window has sep_flag. */
export function hasRecentSep(doses: RadiationDose[], currentDay: number): boolean {
  return doses.some(
    (d) => d.sep_flag && d.mission_day >= currentDay - SEP_LOOKBACK_DAYS && d.mission_day <= currentDay,
  );
}

// ---------- full evaluation ----------

export interface RadiationInput {
  /** Daily doses of ONE crew member (filter by crew_id before calling). */
  doses: RadiationDose[];
  priorDoseMsv: number;
  currentDay: number;
  arrivalDay: number;
  /** Active solar storm from the DONKI snapshot (the UI decides this; engine stays offline). */
  activeStorm?: boolean;
}

export interface RadiationEval {
  state: State;                       // 'none' | 'ok' | 'watch' | 'alert'
  careerMsv: number;
  fraction: number;                   // of 600
  rate: number | null;
  daysToLimit: DaysToLimit;
  projectionMsv: number | null;
  projectionFraction: number | null;
  recentSep: boolean;
  activeStorm: boolean;
  /** Plain-language reasons, for the Radiation card and "Why?". */
  reasons: string[];
}

export function evaluateRadiation(input: RadiationInput): RadiationEval {
  const { doses, priorDoseMsv, currentDay, arrivalDay } = input;
  const activeStorm = input.activeStorm ?? false;

  const careerMsv = careerDose(priorDoseMsv, doses);
  const rate = doseRate(doses);
  const projectionMsv = arrivalProjection(careerMsv, rate, arrivalDay, currentDay);
  const recentSep = hasRecentSep(doses, currentDay);

  const base = {
    careerMsv,
    fraction: fractionOfLimit(careerMsv),
    rate,
    daysToLimit: daysToLimit(careerMsv, rate),
    projectionMsv,
    projectionFraction: projectionMsv === null ? null : fractionOfLimit(projectionMsv),
    recentSep,
    activeStorm,
  };

  // No dosimeter data at all: nothing is computed.
  if (rate === null) {
    return { ...base, state: 'none', reasons: ['No dose data yet.'] };
  }

  const reasons: string[] = [];
  let state: State = 'ok';

  if (careerMsv >= CAREER_LIMIT_MSV) {
    state = 'alert';
    reasons.push('Career dose limit of 600 mSv reached.');
  } else {
    if (base.projectionFraction !== null && base.projectionFraction >= WATCH_PROJECTION_FRACTION) {
      state = 'watch';
      reasons.push(
        `Projected dose at arrival is ${Math.round(base.projectionFraction * 100)}% of the 600 mSv limit (our own design rule: Watch from ${Math.round(WATCH_PROJECTION_FRACTION * 100)}%).`,
      );
    }
    if (activeStorm) {
      state = 'watch';
      reasons.push('Active solar storm reported by NASA DONKI.');
    }
    if (recentSep) {
      state = 'watch';
      reasons.push('Solar particle event recorded in the last 24 hours.');
    }
  }

  return { ...base, state, reasons };
}
