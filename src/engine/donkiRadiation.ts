// src/engine/donkiRadiation.ts
// What the radiation feature adds ON TOP of src/data/donki.ts (summaries, SEP episodes,
// strongest events): loading the bundled snapshot, the "active solar storm" rule, and honesty labels.
// Only loadDonkiSnapshot() is impure.

import { parseDonkiTime, sepEpisodes, type SepEpisode } from '../data/donki';
import type { DonkiSnapshot } from '../data/donki.types';

/** Honest label for the UI: DONKI watches the Sun from near Earth. */
export const DONKI_NOTE =
  'DONKI reports solar events observed from near Earth. On Mars transit it is a proxy for what the Sun is doing, not a measurement of the dose on board.';

export async function loadDonkiSnapshot(
  url: string = `${import.meta.env.BASE_URL}data/donki_snapshot.json`,
): Promise<DonkiSnapshot> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DONKI snapshot not available (${res.status})`);
  return (await res.json()) as DonkiSnapshot;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** "Now" for the demo: end of the capture day, so the offline demo is deterministic. */
export function snapshotAsOf(snapshot: DonkiSnapshot): Date {
  return new Date(`${snapshot.generated_at}T23:59:59Z`);
}

/** NOAA G-scale from Kp (Kp 5 = G1 ... Kp 9 = G5). 0 = below storm level. */
export function gScale(kp: number): number {
  return Math.max(0, Math.min(5, Math.round(kp) - 4));
}

/** End date of a "yyyy-mm-dd/yyyy-mm-dd" range, as the end of that UTC day. null if malformed. */
export function rangeEnd(range: string): Date | null {
  const end = range.split('/')[1];
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  return new Date(`${end}T23:59:59Z`);
}

/**
 * Can this snapshot say anything about SEP events right now?
 * False when the saved SEP window ended more than a day before `asOf`:
 * then "no recent event" would mean "no data", not "nothing happened".
 */
export function sepDataCoversNow(snapshot: DonkiSnapshot, asOf: Date): boolean {
  const end = rangeEnd(snapshot.ranges.sep);
  return end !== null && asOf.getTime() - end.getTime() <= DAY_MS;
}

/**
 * The active solar storm = the most recent SEP EPISODE (records grouped by src/data/donki.ts) that ended
 * within the last `windowHours` (default 24 h) before `asOf`. null if there is none.
 * Geomagnetic storms do not count: SEP is the radiation hazard.
 * [PROPOSED] Team to confirm; same 24 h window as sep_flag in PRD 5.3.
 */
export function activeSepEpisode(snapshot: DonkiSnapshot, asOf: Date, windowHours = 24): SepEpisode | null {
  const now = asOf.getTime();
  // sepEpisodes() is newest first, so the first match is the most recent one.
  return sepEpisodes(snapshot).find((e) => {
    const age = now - parseDonkiTime(e.end).getTime();
    return age >= 0 && age <= windowHours * HOUR_MS;
  }) ?? null;
}

/** Yes/no version of activeSepEpisode(). */
export function isActiveSolarStorm(snapshot: DonkiSnapshot, asOf: Date, windowHours = 24): boolean {
  return activeSepEpisode(snapshot, asOf, windowHours) !== null;
}

// ---------- live API with fallback to the saved snapshot (issue #14) ----------
// Order: try NASA live; on ANY failure (offline, timeout, HTTP error, bad data) use the bundled snapshot.
// The UI is told which one it got, so it never shows old data as if it were live.

export type DonkiOrigin = 'live' | 'saved';

export interface DonkiLoad {
  snapshot: DonkiSnapshot;
  origin: DonkiOrigin;
  /** "Now" for the active-storm rule: the real clock for live data, the capture day for the saved snapshot. */
  asOf: Date;
  /** Why the live call was not used (only when origin is 'saved'). null otherwise. */
  liveError: string | null;
}

/** Since 30 Sep 2026 NASA serves DONKI here, with no key. */
const DONKI_API = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get';

export const LIVE_TIMEOUT_MS = 8000;
/** Same length as the 30-day default NASA uses for DONKI queries. */
export const LIVE_WINDOW_DAYS = 30;

export interface LiveOptions {
  now?: Date;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  windowDays?: number;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** DONKI answers an empty window with an empty body or null, not always with []. */
function asList<T>(body: unknown, what: string): T[] {
  if (body === null || body === undefined || body === '') return [];
  if (!Array.isArray(body)) throw new Error(`NASA returned an unexpected ${what} response`);
  return body as T[];
}

/** One live call per event type, all or nothing. Throws on any problem; loadDonki() turns that into the fallback. */
export async function fetchDonkiLive(opts: LiveOptions = {}): Promise<DonkiSnapshot> {
  const now = opts.now ?? new Date();
  const fetchFn = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const timeoutMs = opts.timeoutMs ?? LIVE_TIMEOUT_MS;
  const windowDays = opts.windowDays ?? LIVE_WINDOW_DAYS;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('device is offline');

  const range = `${ymd(new Date(now.getTime() - windowDays * DAY_MS))}/${ymd(now)}`;
  const [startDate, endDate] = range.split('/');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);

  const get = async <T>(type: 'FLR' | 'CME' | 'GST' | 'SEP'): Promise<T[]> => {
    const url = `${DONKI_API}/${type}?startDate=${startDate}&endDate=${endDate}`;
    const res = await fetchFn(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(res.status === 429 ? 'NASA rate limit reached (HTTP 429)' : `NASA answered HTTP ${res.status}`);
    const text = await res.text();
    return asList<T>(text.trim() === '' ? null : JSON.parse(text), type);
  };

  try {
    const [flares, cme, gst, sep] = await Promise.all([
      get<DonkiSnapshot['flares'][number]>('FLR'),
      get<DonkiSnapshot['cme'][number]>('CME'),
      get<DonkiSnapshot['gst'][number]>('GST'),
      get<DonkiSnapshot['sep'][number]>('SEP'),
    ]);
    return {
      source: 'NASA CCMC DONKI (ccmc.gsfc.nasa.gov/DONKI-API), live',
      generated_at: ymd(now),
      ranges: { flares: range, cme: range, gst: range, sep: range },
      flares, cme, gst, sep,
    };
  } catch (e) {
    if (ctl.signal.aborted) throw new Error(`NASA did not answer within ${Math.round(timeoutMs / 1000)} s`, { cause: e });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const reason = (e: unknown) => (e instanceof Error ? e.message : 'unknown error');

/**
 * Live first, saved snapshot second. Throws only if BOTH fail (then the UI shows its error state).
 * The three sources are injectable so tests need no network.
 */
export async function loadDonki(
  deps: {
    now?: Date;
    live?: () => Promise<DonkiSnapshot>;
    saved?: () => Promise<DonkiSnapshot>;
  } = {},
): Promise<DonkiLoad> {
  const now = deps.now ?? new Date();
  const live = deps.live ?? (() => fetchDonkiLive({ now }));
  const saved = deps.saved ?? (() => loadDonkiSnapshot());
  try {
    return { snapshot: await live(), origin: 'live', asOf: now, liveError: null };
  } catch (liveErr) {
    try {
      const snapshot = await saved();
      return { snapshot, origin: 'saved', asOf: snapshotAsOf(snapshot), liveError: reason(liveErr) };
    } catch (savedErr) {
      throw new Error(`live: ${reason(liveErr)}; saved: ${reason(savedErr)}`, { cause: savedErr });
    }
  }
}
