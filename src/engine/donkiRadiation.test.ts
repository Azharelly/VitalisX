import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sepEpisodes, strongestEvents, lastSep } from '../data/donki';
import type { DonkiSnapshot, DonkiSep } from '../data/donki.types';
import { gScale, isActiveSolarStorm, rangeEnd, sepDataCoversNow, snapshotAsOf } from './donkiRadiation';

const rec = (id: string, time: string, linked: string[] = [], instr = 'GOES-P: SEISS >10 MeV'): DonkiSep => ({
  sepID: id, eventTime: time, instruments: [{ displayName: instr }],
  link: '', linkedEvents: linked.map((activityID) => ({ activityID })), sentNotifications: null, submissionTime: '', versionId: 1,
});
const snapWith = (sep: DonkiSep[], sepRange = '2026-11-01/2026-11-14'): DonkiSnapshot => ({
  source: 't', generated_at: '2026-11-14',
  ranges: { flares: '', cme: '', gst: '', sep: sepRange },
  flares: [], cme: [], gst: [], sep,
});
const asOf = new Date('2026-11-14T12:00:00Z');

describe('gScale', () => {
  it('maps Kp to G', () => {
    expect([4, 5, 7, 9, 9.5].map(gScale)).toEqual([0, 1, 3, 5, 5]);
  });
});

describe('rangeEnd / sepDataCoversNow', () => {
  it('parses the end of a range', () => {
    expect(rangeEnd('2026-07-17/2026-09-15')?.toISOString()).toBe('2026-09-15T23:59:59.000Z');
    expect(rangeEnd('garbage')).toBeNull();
  });
  it('true when the SEP window reaches today', () => {
    expect(sepDataCoversNow(snapWith([]), asOf)).toBe(true);
  });
  it('false when the SEP window ended long ago or is malformed', () => {
    expect(sepDataCoversNow(snapWith([], '2026-07-17/2026-09-15'), asOf)).toBe(false);
    expect(sepDataCoversNow(snapWith([], 'bad'), asOf)).toBe(false);
  });
});

describe('isActiveSolarStorm (uses SEP episodes)', () => {
  it('false with no SEP records', () => expect(isActiveSolarStorm(snapWith([]), asOf)).toBe(false));
  it('true for an episode that ended 6 h ago', () => {
    expect(isActiveSolarStorm(snapWith([rec('a', '2026-11-14T06:00Z')]), asOf)).toBe(true);
  });
  it('false for an episode that ended 30 h ago', () => {
    expect(isActiveSolarStorm(snapWith([rec('a', '2026-11-13T06:00Z')]), asOf)).toBe(false);
  });
  it('several records of one episode count once and use the LAST record time', () => {
    const s = snapWith([
      rec('a', '2026-11-13T05:00Z', ['x-FLR-001']),
      rec('b', '2026-11-14T08:00Z', ['x-FLR-001']),
    ]);
    expect(sepEpisodes(s)).toHaveLength(1);
    expect(isActiveSolarStorm(s, asOf)).toBe(true);
  });
  it('ignores events after asOf', () => {
    expect(isActiveSolarStorm(snapWith([rec('a', '2026-11-15T06:00Z')]), asOf)).toBe(false);
  });
});

describe('the real bundled snapshot', () => {
  const snap = JSON.parse(readFileSync('public/data/donki_snapshot.json', 'utf8')) as DonkiSnapshot;
  it('has the expected record counts', () => {
    expect([snap.flares.length, snap.cme.length, snap.gst.length, snap.sep.length]).toEqual([23, 130, 3, 17]);
  });
  it('groups the 17 SEP records into fewer episodes', () => {
    const eps = sepEpisodes(snap);
    expect(eps.length).toBeLessThan(17);
    expect(eps.reduce((n, e) => n + e.recordCount, 0)).toBe(17);
  });
  it('capture day is the demo "now"', () => {
    expect(snapshotAsOf(snap).toISOString()).toBe('2026-11-14T23:59:59.000Z');
  });
  it('SEP data ends in September, so it cannot cover "now" and no storm is active', () => {
    expect(sepDataCoversNow(snap, snapshotAsOf(snap))).toBe(false);
    expect(isActiveSolarStorm(snap, snapshotAsOf(snap))).toBe(false);
    expect(lastSep(snap)?.start.startsWith('2026-09')).toBe(true);
  });
  it('finds a strongest flare, CME and storm', () => {
    const ev = strongestEvents(snap);
    expect(ev.flare).not.toBeNull();
    expect(ev.cme).not.toBeNull();
    expect(ev.storm?.maxKp).toBe(7);
  });
});
