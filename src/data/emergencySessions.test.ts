import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VitalisDB } from './db';
import { loadEndedEmergencySessions, loadLatestEmergencySession, saveEmergencySession } from './emergencySessions';
import * as flow from '../features/emergency/session';
import type { CrewRef } from '../features/emergency/session';

const T0 = Date.parse('2031-02-02T08:00:00.000Z');
const crew: CrewRef[] = [
  { id: '1', name: 'Amara', isMedic: true, currentHr: 70, currentBpSys: 120, currentBpDia: 80, currentSpo2: 98 },
  { id: '2', name: 'Kenji', currentHr: 72, currentBpSys: 118, currentBpDia: 78, currentSpo2: 99 },
];

let n = 0;
let database: VitalisDB;

beforeEach(() => {
  database = new VitalisDB(`emergency-session-${n++}`);
});

afterEach(async () => {
  await database.delete();
});

describe('emergency session persistence', () => {
  it('restores assignments, progress, packet history, questions, and the incident log', async () => {
    const created = flow.createSession(crew, '2', T0);
    let session = flow.stampLog(created.session, created.events, T0);
    session = {
      ...session,
      currentStepIndex: 2,
      roles: { leaderId: '1', readerId: '1', radioLogId: '1' },
      groundQuestions: ['Start IV fluids?', 'Repeat the reading?'],
      logEntries: [
        ...session.logEntries,
        { timestampIso: new Date(T0 + 30_000).toISOString(), elapsedSec: 30, actor: 'Reader', event: 'DONE Step 1' },
      ],
    };
    session = flow.stampLog(
      flow.sendGroundMessage(session, crew, session.groundQuestions, undefined, 12, T0 + 60_000).session,
      [],
      T0 + 60_000,
    );

    await saveEmergencySession(session, database);
    expect(await loadLatestEmergencySession(database)).toEqual(session);
  });

  it('loads the most recently started emergency', async () => {
    const older = flow.createSession(crew, '1', T0).session;
    const newer = flow.createSession(crew, '2', T0 + 60_000).session;
    await saveEmergencySession(newer, database);
    await saveEmergencySession(older, database);

    expect((await loadLatestEmergencySession(database))?.id).toBe(newer.id);
  });

  it('lists only finished emergencies, newest first', async () => {
    const first = flow.endSession(flow.createSession(crew, '1', T0).session, T0 + 60_000).session;
    const second = flow.endSession(flow.createSession(crew, '2', T0 + 120_000).session, T0 + 180_000).session;
    const running = flow.createSession(crew, '1', T0 + 240_000).session;
    for (const s of [first, running, second]) await saveEmergencySession(s, database);

    expect((await loadEndedEmergencySessions(database)).map((s) => s.id)).toEqual([second.id, first.id]);
  });
});
