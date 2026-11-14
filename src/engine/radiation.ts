// src/engine/radiation.ts
// Pure radiation logic (PRD 5.3). No React, no IndexedDB, no network.
// The caller passes in the data; this file only computes.

import type { SepEpisode } from '../data/donki';
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

/**
 * A solar particle event as recorded in the dose log: the sep_flag days that share one event_id
 * (e.g. "SEP-3"). A flagged day with no event_id stands alone, so it gets a null id.
 */
export interface SepEvent {
  eventId: string | null;
  startDay: number;          // first flagged mission day of this event (whole log, not only the lookback)
  endDay: number;            // last flagged mission day
  days: number[];            // every flagged mission day, ascending
  doseMsv: number;           // dose summed over those days
}

/**
 * The SEP event behind the warning: the most recent event with a sep_flag day inside the
 * lookback window (today and yesterday by default), or null. Returns the event itself,
 * with ALL its flagged days, so the UI can say which one it is.
 */
export function findRecentSep(doses: RadiationDose[], currentDay: number): SepEvent | null {
  const flagged = doses.filter((d) => d.sep_flag);
  const inWindow = flagged.filter(
    (d) => d.mission_day >= currentDay - SEP_LOOKBACK_DAYS && d.mission_day <= currentDay,
  );
  if (inWindow.length === 0) return null;

  const latest = inWindow.reduce((a, b) => (b.mission_day > a.mission_day ? b : a));
  // Same event_id = same event. No event_id = just that one day.
  const members = flagged.filter((d) =>
    latest.event_id === null ? d.mission_day === latest.mission_day : d.event_id === latest.event_id,
  );
  const days = [...new Set(members.map((d) => d.mission_day))].sort((a, b) => a - b);
  return {
    eventId: latest.event_id,
    startDay: days[0],
    endDay: days[days.length - 1],
    days,
    doseMsv: members.reduce((sum, d) => sum + d.dose_msv, 0),
  };
}

/** True if any dose in the lookback window has sep_flag. */
export function hasRecentSep(doses: RadiationDose[], currentDay: number): boolean {
  return findRecentSep(doses, currentDay) !== null;
}

/**
 * sep_flag and event_id must agree: a flagged day names its event, an unflagged day names none.
 * Returns the doses that break this, so a test (or the seed check) can point at them.
 */
export function sepFieldProblems(doses: RadiationDose[]): { dose: RadiationDose; problem: string }[] {
  const out: { dose: RadiationDose; problem: string }[] = [];
  for (const dose of doses) {
    if (dose.sep_flag && dose.event_id === null) out.push({ dose, problem: 'sep_flag is true but event_id is null' });
    if (!dose.sep_flag && dose.event_id !== null) out.push({ dose, problem: 'event_id is set but sep_flag is false' });
  }
  return out;
}

// ---------- full evaluation ----------

export interface RadiationInput {
  /** Daily doses of ONE crew member (filter by crew_id before calling). */
  doses: RadiationDose[];
  priorDoseMsv: number;
  currentDay: number;
  arrivalDay: number;
  /**
   * The SEP episode NASA DONKI reports as active (the UI finds it with activeSepEpisode(); the engine
   * stays offline). Preferred over `activeStorm`, because the warning can then name the episode.
   */
  activeStormEpisode?: SepEpisode | null;
  /** Yes/no only, when the episode is not known. Ignored if activeStormEpisode is given. */
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
  /** The dose-log SEP event behind `recentSep` (event_id, days, dose), or null. */
  sepEvent: SepEvent | null;
  activeStorm: boolean;
  /** The DONKI SEP episode behind `activeStorm`, or null (also null when only a yes/no was given). */
  stormEpisode: SepEpisode | null;
  /** Plain-language reasons, for the Radiation card and "Why?". */
  reasons: string[];
}

export function evaluateRadiation(input: RadiationInput): RadiationEval {
  const { doses, priorDoseMsv, currentDay, arrivalDay } = input;
  const stormEpisode = input.activeStormEpisode ?? null;
  const activeStorm = input.activeStormEpisode !== undefined ? stormEpisode !== null : (input.activeStorm ?? false);

  const careerMsv = careerDose(priorDoseMsv, doses);
  const rate = doseRate(doses);
  const projectionMsv = arrivalProjection(careerMsv, rate, arrivalDay, currentDay);
  const sepEvent = findRecentSep(doses, currentDay);
  const recentSep = sepEvent !== null;

  const base = {
    careerMsv,
    fraction: fractionOfLimit(careerMsv),
    rate,
    daysToLimit: daysToLimit(careerMsv, rate),
    projectionMsv,
    projectionFraction: projectionMsv === null ? null : fractionOfLimit(projectionMsv),
    recentSep,
    sepEvent,
    activeStorm,
    stormEpisode,
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
      reasons.push(describeStorm(stormEpisode));
    }
    if (recentSep) {
      state = 'watch';
      reasons.push(describeSepEvent(sepEvent));
    }
  }

  return { ...base, state, reasons };
}

// ---------- wording of the warnings ----------

const isoDay = (iso: string) => iso.slice(0, 10);

function describeSepEvent(e: SepEvent | null): string {
  if (e === null) return 'Solar particle event recorded in the last 24 hours.';
  const name = e.eventId === null ? 'Solar particle event' : `Solar particle event ${e.eventId}`;
  const when = e.startDay === e.endDay ? `on mission day ${e.endDay}` : `on mission days ${e.startDay} to ${e.endDay}`;
  return `${name} recorded ${when} (${e.doseMsv.toFixed(1)} mSv in the dose log).`;
}

function describeStorm(ep: SepEpisode | null): string {
  if (ep === null) return 'Active solar storm reported by NASA DONKI.';
  const level = ep.over100MeV ? ', reached >100 MeV' : ep.over10MeV ? ', reached >10 MeV' : '';
  return `Active solar storm reported by NASA DONKI: particle event ${ep.id}, ${isoDay(ep.start)} to ${isoDay(ep.end)}${level}.`;
}
