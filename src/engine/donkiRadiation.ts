// src/engine/donkiRadiation.ts
// What the radiation feature adds ON TOP of src/data/donki.ts (summaries, SEP episodes,
// strongest events): loading the bundled snapshot, the "active solar storm" rule, and honesty labels.
// Only loadDonkiSnapshot() is impure.

import { parseDonkiTime, sepEpisodes } from '../data/donki';
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
 * Active solar storm = an SEP EPISODE (records grouped by src/data/donki.ts) that ended
 * within the last `windowHours` (default 24 h). Geomagnetic storms do not count: SEP is the radiation hazard.
 * [PROPOSED] Team to confirm; same 24 h window as sep_flag in PRD 5.3.
 */
export function isActiveSolarStorm(snapshot: DonkiSnapshot, asOf: Date, windowHours = 24): boolean {
  const now = asOf.getTime();
  return sepEpisodes(snapshot).some((e) => {
    const age = now - parseDonkiTime(e.end).getTime();
    return age >= 0 && age <= windowHours * HOUR_MS;
  });
}
