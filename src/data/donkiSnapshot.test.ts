// Guards issue #17: the shipped snapshot is slim, but must answer exactly like the full NASA data.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { latestFlares, sepEpisodes, strongestEvents, summary } from './donki';
import type { DonkiSnapshot } from './donki.types';

const SNAPSHOT_FILE = 'public/data/donki_snapshot.json';
const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));

const slim = read('donki_snapshot.json') as DonkiSnapshot;
const full: DonkiSnapshot = {
    ...slim,
    flares: read('flares.json'),
    cme: read('cme.json'),
    gst: read('gst.json'),
    sep: read('sep.json'),
};

describe('slim DONKI snapshot (issue #17)', () => {
    it('stays small (under 100 KB)', () => {
        expect(readFileSync(SNAPSHOT_FILE).length).toBeLessThan(100 * 1024);
    });

    it('does not carry fields the app never reads', () => {
        const text = readFileSync(SNAPSHOT_FILE, 'utf8');
        expect(text).not.toMatch(/enlilList|sentNotifications|submissionTime|versionId/);
    });

    it('has the same records as the raw NASA files', () => {
        expect(slim.flares).toHaveLength(full.flares.length);
        expect(slim.cme).toHaveLength(full.cme.length);
        expect(slim.gst).toHaveLength(full.gst.length);
        expect(slim.sep).toHaveLength(full.sep.length);
    });

    it('answers like the raw NASA files', () => {
        expect(summary(slim)).toEqual(summary(full));
        expect(latestFlares(slim, 5)).toEqual(latestFlares(full, 5));
        expect(sepEpisodes(slim)).toEqual(sepEpisodes(full));
        expect(strongestEvents(slim)).toEqual(strongestEvents(full));
    });
});