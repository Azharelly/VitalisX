import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseFlareClass, isStrongFlare, gScale, isActiveSolarStorm, summarizeDonki, snapshotAsOf,
  type DonkiSnapshot,
} from './donki';

const empty: DonkiSnapshot = {
  source: 'test', generated_at: '2026-11-14',
  ranges: { flares: '', cme: '', gst: '', sep: '' },
  flares: [], cme: [], gst: [], sep: [],
};
const asOf = new Date('2026-11-14T12:00:00Z');

describe('parseFlareClass', () => {
  it('parses letter and magnitude', () => {
    expect(parseFlareClass('M1.4')).toMatchObject({ letter: 'M', magnitude: 1.4 });
  });
  it('ranks X above M above C', () => {
    expect(parseFlareClass('X1.0').rank).toBeGreaterThan(parseFlareClass('M9.9').rank);
    expect(parseFlareClass('M1.0').rank).toBeGreaterThan(parseFlareClass('C9.9').rank);
  });
  it('handles garbage', () => expect(parseFlareClass('???').letter).toBe('?'));
  it('strong = M or X only', () => {
    expect(isStrongFlare('M1.1')).toBe(true);
    expect(isStrongFlare('X2')).toBe(true);
    expect(isStrongFlare('C9.9')).toBe(false);
  });
});

describe('gScale', () => {
  it('maps Kp to G', () => {
    expect(gScale(4)).toBe(0);
    expect(gScale(5)).toBe(1);
    expect(gScale(7)).toBe(3);
    expect(gScale(9)).toBe(5);
    expect(gScale(9.5)).toBe(5);
  });
});

describe('isActiveSolarStorm', () => {
  it('false with no SEP events', () => expect(isActiveSolarStorm(empty, asOf)).toBe(false));
  it('true for an SEP 6 h ago', () => {
    const s = { ...empty, sep: [{ sepID: 'a', eventTime: '2026-11-14T06:00Z', link: '' }] };
    expect(isActiveSolarStorm(s, asOf)).toBe(true);
  });
  it('false for an SEP 30 h ago', () => {
    const s = { ...empty, sep: [{ sepID: 'a', eventTime: '2026-11-13T06:00Z', link: '' }] };
    expect(isActiveSolarStorm(s, asOf)).toBe(false);
  });
  it('false for an SEP in the future of asOf', () => {
    const s = { ...empty, sep: [{ sepID: 'a', eventTime: '2026-11-15T06:00Z', link: '' }] };
    expect(isActiveSolarStorm(s, asOf)).toBe(false);
  });
  it('a geomagnetic storm alone does not count', () => {
    const s = { ...empty, gst: [{ gstID: 'g', startTime: '2026-11-14T06:00Z', allKpIndex: [{ kpIndex: 7, observedTime: '' }], link: '' }] };
    expect(isActiveSolarStorm(s, asOf)).toBe(false);
  });
});

describe('summarizeDonki on an empty snapshot', () => {
  it('does not crash and returns empty values', () => {
    const r = summarizeDonki(empty, asOf);
    expect(r.flares.total).toBe(0);
    expect(r.flares.strongest).toBeNull();
    expect(r.cmes.fastestKmS).toBeNull();
    expect(r.geomagnetic.maxKp).toBeNull();
    expect(r.sep.latest).toBeNull();
    expect(r.activeSolarStorm).toBe(false);
  });
});

describe('the real bundled snapshot', () => {
  const snap = JSON.parse(readFileSync('public/data/donki_snapshot.json', 'utf8')) as DonkiSnapshot;
  const r = summarizeDonki(snap);
  it('has the expected shape', () => {
    expect(snap.generated_at).toBe('2026-11-14');
    expect(snap.flares.length).toBe(23);
    expect(snap.cme.length).toBe(130);
    expect(snap.gst.length).toBe(3);
    expect(snap.sep.length).toBe(17);
  });
  it('uses the capture day as "now"', () => {
    expect(snapshotAsOf(snap).toISOString()).toBe('2026-11-14T23:59:59.000Z');
  });
  it('finds no active solar storm (latest SEP is in September)', () => {
    expect(r.activeSolarStorm).toBe(false);
    expect(r.sep.latest?.eventTime.startsWith('2026-09')).toBe(true);
  });
  it('reports a strong recent flare and the October storm', () => {
    expect(r.flares.strong).toBeGreaterThan(0);
    // default window is 30 days (since Oct 15): the Oct 31 storm, Kp 6 = G2
    expect(r.geomagnetic.maxKp).toBe(6);
    expect(r.geomagnetic.maxG).toBe(2);
    // a 60-day window also reaches the Oct 10 storm, Kp 7 = G3
    const wide = summarizeDonki(snap, snapshotAsOf(snap), 60);
    expect(wide.geomagnetic.maxKp).toBe(7);
    expect(wide.geomagnetic.maxG).toBe(3);
  });
});
