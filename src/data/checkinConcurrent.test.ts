import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { saveCheckIn } from './checkin';
import { VitalisDB } from './db';

let n = 0;
let db: VitalisDB;

beforeEach(async () => {
    db = new VitalisDB(`concurrent-${n++}`); // fresh database per test
    await db.crew_member.add({
        id: 1, name: 'Test Person', role: 'Commander', sex: 'F', initials: 'TP',
        prior_dose_msv: 0, joined_mission_day: 0, removed_at: null, is_simulated: true,
    });
    await db.metric.add({
        id: 'temp', label: 'Temperature', unit: 'C', zone: 'immune', direction: 'high_is_bad', min_sd: 0.15,
        abs_low: null, abs_high: 37.9, abs_rule: 'Fever from 38.0', default_context: 'resting',
        decimals: 1, priority: 4, source_ids: [],
    });
});

const openAlerts = async () => (await db.alert.toArray()).filter((a) => a.status === 'open');

describe('saveCheckIn: two saves at the same time (double click, two tabs)', () => {
    it('same time stamp: one reading and one open alert', async () => {
        const at = '2031-02-02T08:00:00.000Z';
        await Promise.all([
            saveCheckIn(1, { temp: { value: 38.2 } }, at, 1, db),
            saveCheckIn(1, { temp: { value: 38.2 } }, at, 1, db),
        ]);
        expect(await db.measurement.toArray()).toHaveLength(1);
        expect(await openAlerts()).toHaveLength(1);
    });

    it('time stamps a few milliseconds apart (a real double click): still ONE check-in', async () => {
        await Promise.all([
            saveCheckIn(1, { temp: { value: 38.2 } }, '2031-02-02T08:00:00.000Z', 1, db),
            saveCheckIn(1, { temp: { value: 38.2 } }, '2031-02-02T08:00:00.120Z', 1, db),
        ]);
        expect(await db.measurement.toArray()).toHaveLength(1);
        expect(await openAlerts()).toHaveLength(1);
    });
});