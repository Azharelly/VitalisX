import { describe, expect, it } from 'vitest';
import type { DonkiSep, DonkiSnapshot } from '../data/donki.types';
import { sepWarning } from './sepWarning';

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

describe('sepWarning', () => {
    it('none: no events and the saved data reaches now', () => {
        const w = sepWarning(snapWith([]), asOf);
        expect(w.level).toBe('none');
        expect(w.episode).toBeNull();
    });

    it('watch: an episode ended 6 h ago, no >100 MeV channel', () => {
        const w = sepWarning(snapWith([rec('a', '2026-11-14T06:00Z')]), asOf);
        expect(w.level).toBe('watch');
        expect(w.episode?.id).toBe('a');
        expect(w.rule).toMatch(/6 h ago/);
    });

    it('alert: an observed >100 MeV channel in the active episode', () => {
        const w = sepWarning(snapWith([rec('a', '2026-11-14T06:00Z', [], 'GOES-P: SEISS >100 MeV')]), asOf);
        expect(w.level).toBe('alert');
        expect(w.rule).toMatch(/100 MeV/);
    });

    it('alert when only one record of a multi-record episode has the >100 MeV channel', () => {
        const w = sepWarning(snapWith([
            rec('a', '2026-11-14T05:00Z', ['x-FLR-001'], 'GOES-P: SEISS >10 MeV'),
            rec('b', '2026-11-14T08:00Z', ['x-FLR-001'], 'GOES-P: SEISS >100 MeV'),
        ]), asOf);
        expect(w.level).toBe('alert');
    });

    it('a MODEL output with ">100 MeV" is not an observation: watch, not alert', () => {
        const w = sepWarning(snapWith([rec('a', '2026-11-14T06:00Z', [], 'MODEL: something >100 MeV')]), asOf);
        expect(w.level).toBe('watch');
    });

    it('none when the last episode ended 30 h ago', () => {
        expect(sepWarning(snapWith([rec('a', '2026-11-13T06:00Z')]), asOf).level).toBe('none');
    });

    it('24 h window: exactly 24 h still counts, 24 h and 1 min does not', () => {
        expect(sepWarning(snapWith([rec('a', '2026-11-13T12:00Z')]), asOf).level).toBe('watch');
        expect(sepWarning(snapWith([rec('a', '2026-11-13T11:59Z')]), asOf).level).toBe('none');
    });

    it('ignores events after now', () => {
        expect(sepWarning(snapWith([rec('a', '2026-11-15T06:00Z')]), asOf).level).toBe('none');
    });

    it('no_data: the saved SEP window ended long before now (never says "all clear")', () => {
        const w = sepWarning(snapWith([], '2026-07-17/2026-09-15'), asOf);
        expect(w.level).toBe('no_data');
        expect(w.rule).toMatch(/no data/i);
    });

    it('every message says it is our own design rule', () => {
        const w = sepWarning(snapWith([rec('a', '2026-11-14T06:00Z')]), asOf);
        expect(w.rule).toMatch(/our own design/);
    });
});