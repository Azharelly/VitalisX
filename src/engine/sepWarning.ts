// Radiation warning from solar particle events (issue #15). Pure: no React, no fetch, no IndexedDB.
// Built on activeSepEpisode() and sepDataCoversNow() from donkiRadiation.ts.
// Rule (OUR OWN DESIGN, not NASA's; PRD 5.3 marks it [PROPOSED]):
//   - a SEP episode ended in the last 24 h                          -> watch
//   - ... and an observing instrument reported a ">100 MeV" channel -> alert
//   - no episode, and the saved data reaches "now"                  -> none
//   - no episode, but the saved data stops before "now"             -> no_data
//     ("no news" is not "good news" when we have no data for today)

import { parseDonkiTime, type SepEpisode } from '../data/donki';
import type { DonkiSnapshot } from '../data/donki.types';
import { activeSepEpisode, sepDataCoversNow } from './donkiRadiation';

export type SepWarningLevel = 'none' | 'watch' | 'alert' | 'no_data';

export interface SepWarning {
    level: SepWarningLevel;
    /** The active episode behind a Watch or an Alert. null otherwise. */
    episode: SepEpisode | null;
    /** Plain-language reason, for the "Why?" view. */
    rule: string;
}

const HOUR_MS = 3_600_000;

const ago = (hours: number) => (hours < 1 ? 'less than 1 h' : `${Math.round(hours)} h`);

export function sepWarning(snapshot: DonkiSnapshot, now: Date, windowHours = 24): SepWarning {
    const episode = activeSepEpisode(snapshot, now, windowHours);

    if (episode) {
        const when = ago((now.getTime() - parseDonkiTime(episode.end).getTime()) / HOUR_MS);
        if (episode.over100MeV) {
            return {
                level: 'alert',
                episode,
                rule: `A solar particle event was reported ${when} ago and a satellite measured particles above 100 MeV. Alert: our own design rule, not a NASA threshold.`,
            };
        }
        return {
            level: 'watch',
            episode,
            rule: `A solar particle event was reported ${when} ago. Watch: any event in the last ${windowHours} h, our own design rule, not a NASA threshold.`,
        };
    }

    if (!sepDataCoversNow(snapshot, now)) {
        return {
            level: 'no_data',
            episode: null,
            rule: 'The saved solar-event data stops before now, so we cannot say if there is an event. This is "no data", not "all clear".',
        };
    }

    return { level: 'none', episode: null, rule: `No solar particle event reported in the last ${windowHours} h.` };
}