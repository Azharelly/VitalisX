import { describe, it, expect } from 'vitest';
import type { RadiationDose } from '../data/types';
import {
  careerDose, doseRate, daysToLimit, arrivalProjection, hasRecentSep, evaluateRadiation,
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
