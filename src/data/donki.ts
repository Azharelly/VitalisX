// DONKI logic for the Radiation screen. Pure functions: data in, data out.
// No React, no fetch, no IndexedDB. The UI calls these and only draws what they return.

import type {
    SlimCme,
    SlimFlare,
    SlimGeomagneticStorm,
    SlimSep,
    DonkiSnapshot,
} from './donki.types';

// ---------- time ----------

/** DONKI times look like "2026-10-04T06:13Z" (UTC, no seconds). new Date() parses them. */
export function parseDonkiTime(s: string): Date {
    return new Date(s);
}

// ---------- summary ----------

export interface DonkiSummary {
    source: string;
    generatedAt: string;                 // date we captured the data, "2026-11-14". The UI must show it.
    ranges: DonkiSnapshot['ranges'];     // window of each list; they are not the same for all
    counts: {
        flares: number;
        cme: number;
        geomagneticStorms: number;
        sepRecords: number;                // records, NOT episodes: one episode makes several records
    };
}

export function summary(snap: DonkiSnapshot): DonkiSummary {
    return {
        source: snap.source,
        generatedAt: snap.generated_at,
        ranges: snap.ranges,
        counts: {
            flares: snap.flares.length,
            cme: snap.cme.length,
            geomagneticStorms: snap.gst.length,
            sepRecords: snap.sep.length,
        },
    };
}

// ---------- latest flares ----------

export interface FlareView {
    id: string;                          // flrID
    classType: string;                   // "M6.7"
    peakTime: string;                    // UTC, as DONKI gives it
    region: number;                      // sunspot region
    hasCme: boolean;                     // true if NASA linked a CME to this flare
    link: string;                        // page on the DONKI site
}

function toFlareView(f: SlimFlare): FlareView {
    return {
        id: f.flrID,
        classType: f.classType,
        peakTime: f.peakTime,
        region: f.activeRegionNum,
        hasCme: (f.linkedEvents ?? []).some((e) => e.activityID.includes('-CME-')),
        link: f.link,
    };
}

/** The n most recent flares, newest first (by peak time). n <= 0 gives an empty list. */
export function latestFlares(snap: DonkiSnapshot, n: number): FlareView[] {
    if (!Number.isFinite(n) || n <= 0) return [];
    return [...snap.flares]
        .sort((a, b) => parseDonkiTime(b.peakTime).getTime() - parseDonkiTime(a.peakTime).getTime())
        .slice(0, Math.floor(n))
        .map(toFlareView);
}

// ---------- SEP episodes ----------
// NASA files one SEP record per instrument/channel, so one real episode makes several records
// (2026-07-30: 6 records, 2026-09-05: 8 records). Counting records would overstate how often SEPs happen.
// Our rule (own design, not NASA's): records that share a linked flare or CME belong to the same episode.
// A record with no flare/CME link is its own episode.

export interface SepEpisode {
    id: string;                          // sepID of the earliest record
    start: string;                       // earliest eventTime, UTC as DONKI gives it
    end: string;                         // latest eventTime
    recordCount: number;
    channels: string[];                  // distinct instrument names, sorted (includes MODEL outputs)
    over10MeV: boolean;                  // an observing instrument reported a ">10 MeV" channel
    over100MeV: boolean;                 // an observing instrument reported a ">100 MeV" channel
    linkedEventIds: string[];            // flares and CMEs shared by the records (they may be outside our snapshot window)
    links: string[];                     // DONKI pages of the records
}

const isFlareOrCme = (id: string) => id.includes('-FLR-') || id.includes('-CME-');
const isModel = (name: string) => name.startsWith('MODEL:');   // model output, not a measurement
const OVER_10 = />\s*10\s*MeV/i;       // does not match ">100 MeV": after "10" comes "0", not a space
const OVER_100 = />\s*100\s*MeV/i;

const timeOf = (r: SlimSep) => parseDonkiTime(r.eventTime).getTime();

function buildEpisode(records: SlimSep[]): SepEpisode {
    const sorted = [...records].sort((a, b) => timeOf(a) - timeOf(b) || a.sepID.localeCompare(b.sepID));
    const names = sorted.flatMap((r) => r.instruments.map((i) => i.displayName));
    const observed = names.filter((n) => !isModel(n));
    const linked = sorted.flatMap((r) => (r.linkedEvents ?? []).map((e) => e.activityID).filter(isFlareOrCme));
    return {
        id: sorted[0].sepID,
        start: sorted[0].eventTime,
        end: sorted[sorted.length - 1].eventTime,
        recordCount: sorted.length,
        channels: [...new Set(names)].sort(),
        over10MeV: observed.some((n) => OVER_10.test(n)),
        over100MeV: observed.some((n) => OVER_100.test(n)),
        linkedEventIds: [...new Set(linked)].sort(),
        links: sorted.map((r) => r.link),
    };
}

/** SEP records grouped into episodes, newest first (by end time). */
export function sepEpisodes(snap: DonkiSnapshot): SepEpisode[] {
    const recs = snap.sep;
    const parent = recs.map((_, i) => i);                       // union-find over record indexes
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const firstWith = new Map<string, number>();                // linked id -> first record that cites it
    recs.forEach((r, i) => {
        for (const e of r.linkedEvents ?? []) {
            if (!isFlareOrCme(e.activityID)) continue;
            const seen = firstWith.get(e.activityID);
            if (seen === undefined) firstWith.set(e.activityID, i);
            else parent[find(i)] = find(seen);
        }
    });
    const groups = new Map<number, SlimSep[]>();
    recs.forEach((r, i) => {
        const root = find(i);
        groups.set(root, [...(groups.get(root) ?? []), r]);
    });
    return [...groups.values()]
        .map(buildEpisode)
        .sort((a, b) => parseDonkiTime(b.end).getTime() - parseDonkiTime(a.end).getTime());
}

/** The most recent SEP episode, or null if the snapshot has none. */
export function lastSep(snap: DonkiSnapshot): SepEpisode | null {
    return sepEpisodes(snap)[0] ?? null;
}

// ---------- strongest events ----------
// The flare, CME and geomagnetic storm that stand out in the snapshot window.
// These are facts read from NASA's data. They are NOT radiation doses: there is no valid way
// to turn a flare class, a CME speed or a Kp value into mSv.

export interface CmeView {
    id: string;                          // activityID
    startTime: string;
    speedKmS: number;                    // from the most accurate analysis
    halfAngleDeg: number;
    sourceLocation: string;              // can be ""
    link: string;
}

export interface StormView {
    id: string;                          // gstID
    startTime: string;
    maxKp: number;                       // 0 to 9, can be fractional (5.67)
    maxKpTime: string;                   // when that Kp was observed
    link: string;
}

export interface StrongestEvents {
    flare: FlareView | null;             // highest X-ray class
    cme: CmeView | null;                 // fastest
    storm: StormView | null;             // highest Kp
}

// Flare class = letter + number, e.g. "M6.7". Each letter is 10x the one before: A < B < C < M < X.
// So M10 equals X1.0. Anything that does not look like a class is ignored.
const FLARE_RANK: Record<string, number> = { A: 1, B: 2, C: 3, M: 4, X: 5 };

function flareStrength(classType: string): number | null {
    const m = /^([ABCMX])(\d+(?:\.\d+)?)$/.exec(classType.trim().toUpperCase());
    return m ? Number(m[2]) * 10 ** FLARE_RANK[m[1]] : null;
}

/** Highest-class flare. If two tie, the more recent one wins. */
export function strongestFlare(snap: DonkiSnapshot): FlareView | null {
    let best: { f: SlimFlare; s: number; t: number } | null = null;
    for (const f of snap.flares) {
        const s = flareStrength(f.classType);
        if (s === null) continue;
        const t = parseDonkiTime(f.peakTime).getTime();
        if (best === null || s > best.s || (s === best.s && t > best.t)) best = { f, s, t };
    }
    return best ? toFlareView(best.f) : null;
}

/** Fastest CME, using only analyses NASA marks as most accurate. A CME with none is skipped. If two tie, the more recent wins. */
export function fastestCme(snap: DonkiSnapshot): CmeView | null {
    let best: { c: SlimCme; speed: number; angle: number; t: number } | null = null;
    for (const c of snap.cme) {
        const top = (c.cmeAnalyses ?? [])
            .filter((a) => a.isMostAccurate && Number.isFinite(a.speed))
            .sort((a, b) => b.speed - a.speed)[0];
        if (!top) continue;
        const t = parseDonkiTime(c.startTime).getTime();
        if (best === null || top.speed > best.speed || (top.speed === best.speed && t > best.t)) {
            best = { c, speed: top.speed, angle: top.halfAngle, t };
        }
    }
    return best
        ? {
            id: best.c.activityID,
            startTime: best.c.startTime,
            speedKmS: best.speed,
            halfAngleDeg: best.angle,
            sourceLocation: best.c.sourceLocation,
            link: best.c.link,
        }
        : null;
}

/** Storm with the highest Kp reading. A storm with no Kp readings is skipped. If two tie, the more recent wins. */
export function strongestStorm(snap: DonkiSnapshot): StormView | null {
    let best: { g: SlimGeomagneticStorm; kp: number; at: string; t: number } | null = null;
    for (const g of snap.gst) {
        const top = [...(g.allKpIndex ?? [])].sort((a, b) => b.kpIndex - a.kpIndex)[0];
        if (!top) continue;
        const t = parseDonkiTime(g.startTime).getTime();
        if (best === null || top.kpIndex > best.kp || (top.kpIndex === best.kp && t > best.t)) {
            best = { g, kp: top.kpIndex, at: top.observedTime, t };
        }
    }
    return best
        ? { id: best.g.gstID, startTime: best.g.startTime, maxKp: best.kp, maxKpTime: best.at, link: best.g.link }
        : null;
}

export function strongestEvents(snap: DonkiSnapshot): StrongestEvents {
    return { flare: strongestFlare(snap), cme: fastestCme(snap), storm: strongestStorm(snap) };
}

// Loading, "now" and the active-storm rule live in src/engine/donkiRadiation.ts (the only impure DONKI code).
