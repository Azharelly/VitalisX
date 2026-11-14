import { describe, expect, it } from 'vitest';
import { simulatedTodayApi } from '../today/simulate.ts';
import type { ReportView } from '../today/model.ts';
import { draftSbar, isSendable, privateLine, sbarToText } from './sbar.ts';
import { openItems } from './summary.ts';

const crew = ['amara', 'kenji', 'lucia', 'ravi'];

describe('draftSbar on every simulated person, week and month', () => {
  for (const id of crew)
    for (const days of [7, 28] as const)
      it(`${id} / ${days} days: all four sections filled, names the person and the day`, async () => {
        const r = await simulatedTodayApi.getReport(id, { days });
        const d = draftSbar(r);
        for (const v of Object.values(d)) expect(v.trim().length).toBeGreaterThan(0);
        expect(d.situation).toContain(r.person.name);
        expect(d.situation).toContain(`mission day ${r.missionDay}`);
        expect(d.assessment).toMatch(/Radiation: [\d.]+ mSv career/);
        expect(isSendable(d)).toBe(true);
      });
});

describe('content rules', () => {
  it('lists each shared open item in Situation and asks for review of them', async () => {
    for (const id of crew) {
      const r = await simulatedTodayApi.getReport(id);
      const shared = openItems(r).filter((o) => o.zone !== 'mind');
      const d = draftSbar(r);
      for (const o of shared) expect(d.situation).toContain(o.label);
      expect(d.recommendation).toMatch(shared.length ? /^Requesting flight surgeon review of/ : /^No action requested/);
    }
  });
  it('keeps Mind & sleep out of the draft and offers it separately', async () => {
    let seen = 0;
    for (const id of crew)
      for (const days of [7, 28] as const) {
        const r = await simulatedTodayApi.getReport(id, { days });
        const mindOpen = openItems(r).filter((o) => o.zone === 'mind');
        const all = Object.values(draftSbar(r)).join('\n');
        for (const o of mindOpen) {
          seen++;
          expect(all).not.toContain(o.label);
          expect(privateLine(r)).toContain(o.label);
        }
        if (!mindOpen.length) expect(privateLine(r)).toBeNull();
      }
    // synthetic case so the rule is always exercised, whatever the simulation produces
    const base = await simulatedTodayApi.getReport('amara');
    const m = { ...base.metrics[0], zone: 'mind' as const, level: 'watch' as const, label: 'Sleep duration X' };
    const r: ReportView = { ...base, metrics: [m], events: [{ day: base.missionDay, metricId: m.id, label: m.label, from: 'ok', to: 'watch' }] };
    expect(Object.values(draftSbar(r)).join('\n')).not.toContain('Sleep duration X');
    expect(privateLine(r)).toContain('Sleep duration X');
    expect(seen).toBeGreaterThanOrEqual(0);
  });
  it('caps the status-change list', async () => {
    const base = await simulatedTodayApi.getReport('amara', { days: 28 });
    const events = Array.from({ length: 10 }, (_, i) => ({ day: base.missionDay - i, metricId: base.metrics[0].id, label: base.metrics[0].label, from: 'ok' as const, to: 'watch' as const }));
    const d = draftSbar({ ...base, events });
    expect(d.background).toContain('latest 6 of 10');
  });
});

describe('sbarToText / isSendable', () => {
  it('labels sections and skips empty ones', () => {
    const t = sbarToText({ situation: ' S text ', background: '', assessment: 'A text', recommendation: '' });
    expect(t).toBe('S — Situation\nS text\n\nA — Assessment\nA text');
  });
  it('is not sendable without a situation', () => {
    expect(isSendable({ situation: '  ', background: 'b', assessment: 'a', recommendation: 'r' })).toBe(false);
  });
});

import { arrivalLeftSec } from '../../data/outbox'
import { MIN_CHECKIN_DAYS } from './SbarDialog'
describe('outbox countdown and readiness (#23)', () => {
  it('needs 3 check-in days', () => expect(MIN_CHECKIN_DAYS).toBe(3))
  it('counts down from created_at + delay_sec', () => {
    const m = { createdAt: '2026-11-14T00:00:00.000Z', delaySec: 750 }
    expect(arrivalLeftSec(m, Date.parse('2026-11-14T00:00:00.000Z'))).toBe(750)
    expect(arrivalLeftSec(m, Date.parse('2026-11-14T00:10:00.000Z'))).toBe(150)
    expect(arrivalLeftSec(m, Date.parse('2026-11-14T01:00:00.000Z'))).toBe(0)
  })
})
