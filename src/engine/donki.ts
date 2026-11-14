// src/engine/donki.ts
// Reads the bundled NASA DONKI snapshot (public/data/donki_snapshot.json).
// Everything except loadDonkiSnapshot() is a pure function (easy to test, works offline).
// Source: NASA CCMC DONKI, https://ccmc.gsfc.nasa.gov/DONKI-API

// ---------- raw snapshot types (only the fields we use) ----------
export interface DonkiFlare {
  flrID: string;
  beginTime: string;
  peakTime: string | null;
  endTime: string | null;
  classType: string;              // e.g. "M1.4"
  sourceLocation: string | null;
  link: string;
}
export interface DonkiCmeAnalysis { speed: number | null; isMostAccurate: boolean }
export interface DonkiCme {
  activityID: string;
  startTime: string;
  cmeAnalyses: DonkiCmeAnalysis[] | null;
  link: string;
}
export interface DonkiGst {
  gstID: string;
  startTime: string;
  allKpIndex: { kpIndex: number; observedTime: string }[];
  link: string;
}
export interface DonkiSep {
  sepID: string;
  eventTime: string;
  link: string;
}
export interface DonkiSnapshot {
  source: string;
  generated_at: string;           // "2026-11-14"
  ranges: { flares: string; cme: string; gst: string; sep: string };
  flares: DonkiFlare[];
  cme: DonkiCme[];
  gst: DonkiGst[];
  sep: DonkiSep[];
}

/** Honest label for the UI: DONKI watches the Sun from near Earth. */
export const DONKI_NOTE =
  'DONKI reports solar events observed from near Earth. On Mars transit it is a proxy for what the Sun is doing, not a measurement of the dose on board.';

// ---------- loading (the only impure function) ----------
export async function loadDonkiSnapshot(
  url: string = `${import.meta.env.BASE_URL}data/donki_snapshot.json`,
): Promise<DonkiSnapshot> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DONKI snapshot not available (${res.status})`);
  return (await res.json()) as DonkiSnapshot;
}

// ---------- helpers ----------
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** "Now" for the demo: end of the capture day, so the offline demo is deterministic. */
export function snapshotAsOf(snapshot: DonkiSnapshot): Date {
  return new Date(`${snapshot.generated_at}T23:59:59Z`);
}

const t = (iso: string) => new Date(iso).getTime();

export interface FlareClass {
  letter: 'A' | 'B' | 'C' | 'M' | 'X' | '?';
  magnitude: number;
  /** Comparable number: bigger = stronger flare. */
  rank: number;
}

/** "M1.4" -> { letter: 'M', magnitude: 1.4, rank: 4.14 } */
export function parseFlareClass(classType: string): FlareClass {
  const m = /^([ABCMX])\s*(\d+(?:\.\d+)?)/i.exec(classType.trim());
  if (!m) return { letter: '?', magnitude: 0, rank: -1 };
  const letter = m[1].toUpperCase() as FlareClass['letter'];
  const magnitude = parseFloat(m[2]);
  const order = 'ABCMX'.indexOf(letter);
  return { letter, magnitude, rank: order + magnitude / 10 };
}

export function isStrongFlare(classType: string): boolean {
  const { letter } = parseFlareClass(classType);
  return letter === 'M' || letter === 'X';
}

export function maxKp(gst: DonkiGst): number {
  return gst.allKpIndex.length ? Math.max(...gst.allKpIndex.map((k) => k.kpIndex)) : 0;
}

/** NOAA G-scale from Kp (Kp 5 = G1 ... Kp 9 = G5). 0 = below storm level. */
export function gScale(kp: number): number {
  return Math.max(0, Math.min(5, Math.round(kp) - 4));
}

function fastestCmeSpeed(c: DonkiCme): number {
  const speeds = (c.cmeAnalyses ?? []).map((a) => a.speed ?? 0);
  return speeds.length ? Math.max(...speeds) : 0;
}

// ---------- the storm rule used by the radiation engine ----------
/**
 * Active solar storm = a solar energetic particle (SEP) event in the last `windowHours` (default 24 h).
 * SEP events are the radiation hazard; geomagnetic storms (GST) are shown but do not count.
 * [PROPOSED] Team to confirm, same 24 h window as sep_flag in PRD 5.3.
 */
export function isActiveSolarStorm(
  snapshot: DonkiSnapshot,
  asOf: Date,
  windowHours = 24,
): boolean {
  const now = asOf.getTime();
  return snapshot.sep.some((e) => {
    const age = now - t(e.eventTime);
    return age >= 0 && age <= windowHours * HOUR_MS;
  });
}

// ---------- summary for the DONKI panel ----------
export interface DonkiSummary {
  capturedOn: string;
  source: string;
  windowDays: number;
  activeSolarStorm: boolean;
  flares: { total: number; strong: number; strongest: DonkiFlare | null; recent: DonkiFlare[] };
  cmes: { total: number; fastestKmS: number | null };
  geomagnetic: { total: number; maxKp: number | null; maxG: number; latest: DonkiGst | null };
  sep: { total: number; latest: DonkiSep | null; daysSinceLatest: number | null };
}

export function summarizeDonki(
  snapshot: DonkiSnapshot,
  asOf: Date = snapshotAsOf(snapshot),
  windowDays = 30,
  maxRecent = 5,
): DonkiSummary {
  const now = asOf.getTime();
  const from = now - windowDays * DAY_MS;
  const inWindow = (iso: string) => t(iso) >= from && t(iso) <= now;

  const flares = snapshot.flares.filter((f) => inWindow(f.beginTime));
  const byStrength = [...flares].sort(
    (a, b) => parseFlareClass(b.classType).rank - parseFlareClass(a.classType).rank,
  );
  const recent = [...flares]
    .filter((f) => isStrongFlare(f.classType))
    .sort((a, b) => t(b.beginTime) - t(a.beginTime))
    .slice(0, maxRecent);

  const cmes = snapshot.cme.filter((c) => inWindow(c.startTime));
  const speeds = cmes.map(fastestCmeSpeed).filter((s) => s > 0);

  const gsts = snapshot.gst.filter((g) => inWindow(g.startTime));
  const latestGst = [...gsts].sort((a, b) => t(b.startTime) - t(a.startTime))[0] ?? null;
  const kps = gsts.map(maxKp);
  const topKp = kps.length ? Math.max(...kps) : null;

  // SEP: report the latest event overall (the snapshot range can be older than the window).
  const seps = snapshot.sep.filter((e) => t(e.eventTime) <= now);
  const latestSep = [...seps].sort((a, b) => t(b.eventTime) - t(a.eventTime))[0] ?? null;

  return {
    capturedOn: snapshot.generated_at,
    source: snapshot.source,
    windowDays,
    activeSolarStorm: isActiveSolarStorm(snapshot, asOf),
    flares: { total: flares.length, strong: flares.filter((f) => isStrongFlare(f.classType)).length, strongest: byStrength[0] ?? null, recent },
    cmes: { total: cmes.length, fastestKmS: speeds.length ? Math.max(...speeds) : null },
    geomagnetic: { total: gsts.length, maxKp: topKp, maxG: topKp === null ? 0 : gScale(topKp), latest: latestGst },
    sep: {
      total: snapshot.sep.length,
      latest: latestSep,
      daysSinceLatest: latestSep ? Math.floor((now - t(latestSep.eventTime)) / DAY_MS) : null,
    },
  };
}
