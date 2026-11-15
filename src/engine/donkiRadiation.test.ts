import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sepEpisodes, strongestEvents, lastSep } from '../data/donki';
import type { DonkiSnapshot, DonkiSep } from '../data/donki.types';
import {
  activeSepEpisode, fetchDonkiLive, gScale, isActiveSolarStorm, loadDonki, rangeEnd, sepDataCoversNow, snapshotAsOf,
} from './donkiRadiation';

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

describe('activeSepEpisode (issue #15)', () => {
  it('returns the episode itself, with its id and times', () => {
    const ep = activeSepEpisode(snapWith([rec('2026-11-14T05:00:00-SEP-001', '2026-11-14T06:00Z')]), asOf);
    expect(ep?.id).toBe('2026-11-14T05:00:00-SEP-001');
    expect(ep?.end).toBe('2026-11-14T06:00Z');
  });
  it('picks the most recent active episode when two ended inside the window', () => {
    const s = snapWith([rec('old', '2026-11-13T20:00Z'), rec('new', '2026-11-14T09:00Z')]);
    expect(activeSepEpisode(s, asOf)?.id).toBe('new');
  });
  it('null when nothing is active', () => {
    expect(activeSepEpisode(snapWith([rec('a', '2026-11-10T06:00Z')]), asOf)).toBeNull();
  });
});

// ---------- live API with fallback (issue #14) ----------
const okJson = (body: unknown) => ({ ok: true, status: 200, text: async () => (body === '' ? '' : JSON.stringify(body)) }) as Response;
const fakeFetch = (routes: Record<string, () => Response | Promise<Response>>): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(`/get/${k}?`));
    if (!key) throw new Error(`unexpected url ${url}`);
    return routes[key]();
  }) as typeof fetch;
const now = new Date('2026-11-14T12:00:00Z');

describe('fetchDonkiLive', () => {
  it('calls all four endpoints for the last 30 days and builds a snapshot', async () => {
    const urls: string[] = [];
    const f = (async (input: RequestInfo | URL) => { urls.push(String(input)); return okJson([]); }) as typeof fetch;
    const snap = await fetchDonkiLive({ now, fetchFn: f });
    expect(urls).toHaveLength(4);
    expect(urls.every((u) => u.includes('startDate=2026-10-15') && u.includes('endDate=2026-11-14') && u.startsWith('https://ccmc.gsfc.nasa.gov/DONKI-API/get/') && !u.includes('api_key'))).toBe(true);
    expect(snap.generated_at).toBe('2026-11-14');
    expect(snap.ranges.sep).toBe('2026-10-15/2026-11-14');
  });
  it('treats an empty response body as "no events"', async () => {
    const snap = await fetchDonkiLive({ now, fetchFn: fakeFetch({ FLR: () => okJson(''), CME: () => okJson([]), GST: () => okJson(null), SEP: () => okJson([]) }) });
    expect([snap.flares, snap.cme, snap.gst, snap.sep].every((l) => l.length === 0)).toBe(true);
  });
  it('rejects on an HTTP error, naming the rate limit for 429', async () => {
    const bad = () => ({ ok: false, status: 429, text: async () => '' }) as Response;
    await expect(fetchDonkiLive({ now, fetchFn: fakeFetch({ FLR: bad, CME: () => okJson([]), GST: () => okJson([]), SEP: () => okJson([]) }) }))
      .rejects.toThrow(/rate limit/);
  });
  it('rejects when NASA returns something that is not a list', async () => {
    await expect(fetchDonkiLive({ now, fetchFn: fakeFetch({ FLR: () => okJson({ error: 'x' }), CME: () => okJson([]), GST: () => okJson([]), SEP: () => okJson([]) }) }))
      .rejects.toThrow(/unexpected/);
  });
  it('rejects with a timeout message when NASA does not answer', async () => {
    const hang = ((_: unknown, init?: RequestInit) => new Promise((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    })) as typeof fetch;
    await expect(fetchDonkiLive({ now, fetchFn: hang, timeoutMs: 20 })).rejects.toThrow(/did not answer within/);
  });
});

describe('loadDonki: live first, saved as fallback', () => {
  const live = snapWith([], '2026-10-15/2026-11-14');
  const saved = JSON.parse(readFileSync('public/data/donki_snapshot.json', 'utf8')) as DonkiSnapshot;

  it('uses live data when the call works, with the real clock as "now"', async () => {
    let savedCalls = 0;
    const r = await loadDonki({ now, live: async () => live, saved: async () => { savedCalls++; return saved; } });
    expect(r.origin).toBe('live');
    expect(r.snapshot).toBe(live);
    expect(r.asOf).toBe(now);
    expect(r.liveError).toBeNull();
    expect(savedCalls).toBe(0);
  });
  it('falls back to the saved snapshot when live fails, and says why', async () => {
    const r = await loadDonki({ now, live: async () => { throw new Error('device is offline'); }, saved: async () => saved });
    expect(r.origin).toBe('saved');
    expect(r.snapshot).toBe(saved);
    expect(r.liveError).toBe('device is offline');
    expect(r.asOf.toISOString()).toBe('2026-11-14T23:59:59.000Z');    // capture day, deterministic demo
  });
  it('throws only when both live and saved fail', async () => {
    await expect(loadDonki({
      now, live: async () => { throw new Error('offline'); }, saved: async () => { throw new Error('missing'); },
    })).rejects.toThrow(/live: offline; saved: missing/);
  });
});
