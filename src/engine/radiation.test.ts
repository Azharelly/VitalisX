import { describe, it, expect } from 'vitest';
import type { SepEpisode } from '../data/donki';
import type { RadiationDose } from '../data/types';
import {
  careerDose, doseRate, daysToLimit, arrivalProjection, hasRecentSep, evaluateRadiation, findRecentSep, sepFieldProblems,
} from './radiation';

const dose = (day: number, msv: number, sep = false): RadiationDose => ({
  id: day, crew_id: 1, mission_day: day, date: `2031-01-${day}`,
  dose_msv: msv, environment: 'mars_transit', sep_flag: sep, event_id: null, is_simulated: true,
});
const flat = (days: number, msv: number) =>
  Array.from({ length: days }, (_, i) => dose(i + 1, msv));

describe('careerDose', () => {
  it('adds prior dose and daily doses', () => {
    expect(careerDose(130, flat(10, 2))).toBe(150);
  });
  it('with no doses equals the prior dose', () => {
    expect(careerDose(25, [])).toBe(25);
  });
});

describe('doseRate', () => {
  it('is null with no data', () => expect(doseRate([])).toBeNull());
  it('uses fewer days if that is all there is', () => {
    expect(doseRate([dose(1, 2), dose(2, 4)])).toBe(3);
  });
  it('uses only the last 7 days, regardless of input order', () => {
    const doses = [...flat(10, 1)].reverse();
    doses.push(dose(11, 8)); // last day is high
    // last 7 days = days 5..11 -> six 1s and one 8 = 14/7 = 2
    expect(doseRate(doses)).toBe(2);
  });
  it('can be exactly 0', () => expect(doseRate(flat(7, 0))).toBe(0));
});

describe('daysToLimit', () => {
  it('computes days', () => expect(daysToLimit(400, 2)).toEqual({ status: 'days', days: 100 }));
  it('unavailable when rate is 0', () => expect(daysToLimit(100, 0)).toEqual({ status: 'unavailable' }));
  it('unavailable when rate is null', () => expect(daysToLimit(100, null)).toEqual({ status: 'unavailable' }));
  it('reached at exactly 600', () => expect(daysToLimit(600, 2)).toEqual({ status: 'reached' }));
  it('reached above 600, never negative days', () => expect(daysToLimit(650, 2)).toEqual({ status: 'reached' }));
});

describe('arrivalProjection', () => {
  it('projects forward', () => expect(arrivalProjection(405, 2, 210, 142)).toBe(405 + 2 * 68));
  it('is null if arrival is today', () => expect(arrivalProjection(405, 2, 142, 142)).toBeNull());
  it('is null if arrival already passed', () => expect(arrivalProjection(405, 2, 100, 142)).toBeNull());
  it('is null without a rate', () => expect(arrivalProjection(405, null, 210, 142)).toBeNull());
});

describe('hasRecentSep', () => {
  it('true for flag today or yesterday', () => {
    expect(hasRecentSep([dose(141, 2, true)], 142)).toBe(true);
    expect(hasRecentSep([dose(142, 2, true)], 142)).toBe(true);
  });
  it('false for older flags', () => expect(hasRecentSep([dose(139, 2, true)], 142)).toBe(false));
});

describe('evaluateRadiation', () => {
  it('no data -> state none', () => {
    const r = evaluateRadiation({ doses: [], priorDoseMsv: 0, currentDay: 142, arrivalDay: 210 });
    expect(r.state).toBe('none');
    expect(r.rate).toBeNull();
    expect(r.projectionMsv).toBeNull();
  });

  it('rate 0 -> ok, days unavailable, no crash', () => {
    const r = evaluateRadiation({ doses: flat(7, 0), priorDoseMsv: 10, currentDay: 142, arrivalDay: 210 });
    expect(r.state).toBe('ok');
    expect(r.daysToLimit).toEqual({ status: 'unavailable' });
  });

  it('dose >= 600 -> alert "limit reached"', () => {
    const r = evaluateRadiation({ doses: flat(10, 2), priorDoseMsv: 590, currentDay: 142, arrivalDay: 210 });
    expect(r.state).toBe('alert');
    expect(r.daysToLimit).toEqual({ status: 'reached' });
  });

  it('arrival already passed -> projection hidden, ok', () => {
    const r = evaluateRadiation({ doses: flat(142, 1), priorDoseMsv: 10, currentDay: 142, arrivalDay: 100 });
    expect(r.projectionMsv).toBeNull();
    expect(r.state).toBe('ok');
  });

  it('GOLDEN Kenji: 405 mSv today, ~536 projected, ~89% -> Watch', () => {
    // prior 130 + 142 days that add up to 275 -> career 405
    const doses = flat(142, 275 / 142);
    const r = evaluateRadiation({ doses, priorDoseMsv: 130, currentDay: 142, arrivalDay: 210 });
    expect(r.careerMsv).toBeCloseTo(405, 5);
    expect(r.projectionMsv).toBeCloseTo(536.7, 0);
    expect(r.projectionFraction!).toBeGreaterThan(0.88);
    expect(r.projectionFraction!).toBeLessThan(0.9);
    expect(r.state).toBe('watch');
  });

  it('GOLDEN Lucía-like low dose -> ok', () => {
    const r = evaluateRadiation({ doses: flat(142, 1.8), priorDoseMsv: 10, currentDay: 142, arrivalDay: 210 });
    expect(r.state).toBe('ok');
  });

  it('active solar storm -> watch even with low projection', () => {
    const r = evaluateRadiation({
      doses: flat(142, 0.5), priorDoseMsv: 0, currentDay: 142, arrivalDay: 210, activeStorm: true,
    });
    expect(r.state).toBe('watch');
    expect(r.reasons.join(' ')).toMatch(/DONKI/);
  });

  it('sep_flag in last 24 h -> watch', () => {
    const doses = [...flat(141, 0.5), dose(142, 3, true)];
    const r = evaluateRadiation({ doses, priorDoseMsv: 0, currentDay: 142, arrivalDay: 210 });
    expect(r.state).toBe('watch');
  });

  it('limit reached wins over storm (stays alert)', () => {
    const r = evaluateRadiation({
      doses: flat(10, 1), priorDoseMsv: 600, currentDay: 142, arrivalDay: 210, activeStorm: true,
    });
    expect(r.state).toBe('alert');
  });
});

// ---------- SEP warning names the episode (issue #15) ----------
const sepDose = (day: number, msv: number, eventId: string | null): RadiationDose => ({
  ...dose(day, msv, true), event_id: eventId,
});

describe('findRecentSep: which event is it?', () => {
  it('null when no flagged day is in the last 24 h', () => {
    expect(findRecentSep([...flat(140, 0.5), sepDose(139, 3, 'SEP-2')], 142)).toBeNull();
  });
  it('returns the event_id, its flagged days and their summed dose', () => {
    const doses = [...flat(140, 0.5), sepDose(141, 3, 'SEP-3'), sepDose(142, 4, 'SEP-3')];
    expect(findRecentSep(doses, 142)).toEqual({ eventId: 'SEP-3', startDay: 141, endDay: 142, days: [141, 142], doseMsv: 7 });
  });
  it('a multi-day event that started before the window still reports its first day', () => {
    const doses = [sepDose(139, 2, 'SEP-3'), sepDose(140, 2, 'SEP-3'), sepDose(142, 2, 'SEP-3')];
    expect(findRecentSep(doses, 142)?.startDay).toBe(139);
  });
  it('does not mix two different events', () => {
    const doses = [sepDose(100, 5, 'SEP-1'), sepDose(142, 3, 'SEP-4')];
    expect(findRecentSep(doses, 142)).toMatchObject({ eventId: 'SEP-4', days: [142], doseMsv: 3 });
  });
  it('a flagged day with no event_id stands alone with a null id', () => {
    expect(findRecentSep([sepDose(142, 3, null)], 142)).toMatchObject({ eventId: null, days: [142] });
  });
  it('hasRecentSep agrees', () => {
    expect(hasRecentSep([sepDose(142, 3, 'SEP-3')], 142)).toBe(true);
    expect(hasRecentSep(flat(142, 1), 142)).toBe(false);
  });
});

describe('evaluateRadiation: the warning says which event', () => {
  it('dose-log SEP: reason names the event_id and the day, and sepEvent is returned', () => {
    const doses = [...flat(141, 0.5), sepDose(142, 3, 'SEP-3')];
    const r = evaluateRadiation({ doses, priorDoseMsv: 0, currentDay: 142, arrivalDay: 210 });
    expect(r.state).toBe('watch');
    expect(r.sepEvent?.eventId).toBe('SEP-3');
    expect(r.reasons.join(' ')).toMatch(/SEP-3.*mission day 142/);
  });
  it('no recent SEP: sepEvent is null', () => {
    expect(evaluateRadiation({ doses: flat(142, 0.5), priorDoseMsv: 0, currentDay: 142, arrivalDay: 210 }).sepEvent).toBeNull();
  });
  const episode: SepEpisode = {
    id: '2026-11-14T05:00:00-SEP-001', start: '2026-11-14T05:00Z', end: '2026-11-14T08:00Z', recordCount: 3,
    channels: [], over10MeV: true, over100MeV: false, linkedEventIds: [], links: [],
  };
  it('DONKI episode: reason names the episode and returns it', () => {
    const r = evaluateRadiation({ doses: flat(142, 0.5), priorDoseMsv: 0, currentDay: 142, arrivalDay: 210, activeStormEpisode: episode });
    expect(r.state).toBe('watch');
    expect(r.activeStorm).toBe(true);
    expect(r.stormEpisode).toBe(episode);
    expect(r.reasons.join(' ')).toMatch(/2026-11-14T05:00:00-SEP-001.*>10 MeV/);
  });
  it('activeStormEpisode = null means no storm, even if a boolean says otherwise', () => {
    const r = evaluateRadiation({ doses: flat(142, 0.5), priorDoseMsv: 0, currentDay: 142, arrivalDay: 210, activeStormEpisode: null, activeStorm: true });
    expect(r.activeStorm).toBe(false);
  });
  it('the old yes/no input still works', () => {
    const r = evaluateRadiation({ doses: flat(142, 0.5), priorDoseMsv: 0, currentDay: 142, arrivalDay: 210, activeStorm: true });
    expect(r.activeStorm).toBe(true);
    expect(r.stormEpisode).toBeNull();
  });
  it('both sources can fire; both are named', () => {
    const doses = [...flat(141, 0.5), sepDose(142, 3, 'SEP-3')];
    const r = evaluateRadiation({ doses, priorDoseMsv: 0, currentDay: 142, arrivalDay: 210, activeStormEpisode: episode });
    expect(r.reasons.join(' ')).toMatch(/DONKI/);
    expect(r.reasons.join(' ')).toMatch(/SEP-3/);
  });
});

describe('sepFieldProblems: sep_flag and event_id must agree', () => {
  it('clean data has no problems', () => {
    expect(sepFieldProblems([dose(1, 1), sepDose(2, 3, 'SEP-1')])).toEqual([]);
  });
  it('flags a SEP day with no event_id, and an event_id on a non-SEP day', () => {
    const bad: RadiationDose = { ...dose(4, 1), event_id: 'SEP-9' };
    const found = sepFieldProblems([sepDose(3, 3, null), bad]).map((p) => p.dose.mission_day);
    expect(found).toEqual([3, 4]);
  });
});
