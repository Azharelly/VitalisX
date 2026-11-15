import { VITALS_CHECK_INTERVAL_MS } from './model';
import type {
  EmergencyCondition,
  EmergencyRoleAssignment,
  EmergencySession,
  GroundMessagePacket,
} from './model';
import { ALL_STEPS_BY_ID, CONDITION_LABELS, EMERGENCY_PROTOCOLS } from './protocols';
import { pickRoles, reassignRole } from './roles';

/**
 * Pure session logic. Nothing here touches React, the clock or storage: every function takes `now`
 * and returns the next session plus the log events to record. The provider applies and persists them,
 * so a state updater never has side effects (React StrictMode may run updaters twice).
 */

export interface CrewRef {
  id: string;
  name: string;
  isMedic?: boolean;
  currentHr: number;
  currentBpSys: number;
  currentBpDia: number;
  currentSpo2: number;
}

export interface LogEvent {
  actor: string;
  event: string;
}

export interface Transition {
  session: EmergencySession;
  events: LogEvent[];
}

const nameOf = (crew: readonly CrewRef[], id: string) => crew.find((c) => c.id === id)?.name ?? id;
const stepsOf = (condition: EmergencyCondition) => EMERGENCY_PROTOCOLS[condition];
const without = (ids: string[], id: string) => ids.filter((x) => x !== id);
const withId = (ids: string[], id: string) => (ids.includes(id) ? ids : [...ids, id]);

/** Appends events to the session log with their timestamps. */
export function stampLog(session: EmergencySession, events: LogEvent[], now: number): EmergencySession {
  if (events.length === 0) return session;
  const timestampIso = new Date(now).toISOString();
  const elapsedSec = Math.max(0, Math.floor((now - new Date(session.startedAtIso).getTime()) / 1000));
  return {
    ...session,
    logEntries: [...session.logEntries, ...events.map((e) => ({ timestampIso, elapsedSec, ...e }))],
  };
}

export function createSession(
  crew: readonly CrewRef[],
  defaultPatientId: string | undefined,
  now: number,
): Transition {
  const patient = crew.find((c) => c.id === defaultPatientId) ?? crew[1] ?? crew[0];
  const patientId = patient?.id ?? 'unknown';
  const startedAtIso = new Date(now).toISOString();
  return {
    session: {
      id: `emg-${now}`,
      startedAtIso,
      patientId,
      condition: 'bleeding',
      roles: pickRoles(crew, patientId),
      currentStepIndex: -1, // Role & Triage screen (CREW 9)
      completedStepIds: [],
      skippedStepIds: [],
      nextVitalsCheckAtIso: new Date(now + VITALS_CHECK_INTERVAL_MS).toISOString(),
      wallMode: false,
      groundQuestions: ['Start IV fluids?'],
      groundPackets: [],
      logEntries: [],
    },
    events: [{ actor: 'System', event: 'EMERGENCY activated — timer and auto-log started. Patient readings opened to crew.' }],
  };
}

export function setPatient(prev: EmergencySession, crew: readonly CrewRef[], patientId: string): Transition {
  // Anyone who was given a job but is now the patient is replaced; everyone else keeps theirs.
  const roles = pickRoles(crew, patientId, prev.roles);
  return {
    session: { ...prev, patientId, roles },
    events: [{ actor: 'Crew', event: `Patient set to ${nameOf(crew, patientId)}` }],
  };
}

export function setCondition(prev: EmergencySession, condition: EmergencyCondition): Transition {
  return {
    session: { ...prev, condition, currentStepIndex: -1 },
    events: [{ actor: 'Crew', event: `Condition selected: ${CONDITION_LABELS[condition]}` }],
  };
}

export function updateRole(
  prev: EmergencySession,
  crew: readonly CrewRef[],
  role: keyof EmergencyRoleAssignment,
  crewId: string,
): Transition | null {
  const roles = reassignRole(prev.roles, prev.patientId, role, crewId);
  if (!roles) return null;
  return {
    session: { ...prev, roles },
    events: [{ actor: 'Crew', event: `Role ${role} assigned to ${nameOf(crew, crewId)}` }],
  };
}

export function startSteps(prev: EmergencySession): Transition {
  return {
    session: { ...prev, currentStepIndex: 0 },
    events: [{ actor: 'Reader', event: `Started ${CONDITION_LABELS[prev.condition]} checklist (Step 1)` }],
  };
}

function summary(prev: EmergencySession) {
  const steps = stepsOf(prev.condition);
  const done = steps.filter((s) => prev.completedStepIds.includes(s.id)).length;
  const skipped = steps.filter((s) => prev.skippedStepIds.includes(s.id)).length;
  return { done, skipped, total: steps.length };
}

/** Moves past the current step. Returns null when there is no current step (setup screen or already finished). */
function advance(
  prev: EmergencySession,
  verb: 'DONE' | "CAN'T DO",
  now: number,
  patientName: string,
): Transition | null {
  const steps = stepsOf(prev.condition);
  const step = steps[prev.currentStepIndex];
  if (!step) return null;

  const done = verb === 'DONE';
  const session: EmergencySession = {
    ...prev,
    // A step is either done or skipped, never both (it can be redone after "Back").
    completedStepIds: done ? withId(prev.completedStepIds, step.id) : without(prev.completedStepIds, step.id),
    skippedStepIds: done ? without(prev.skippedStepIds, step.id) : withId(prev.skippedStepIds, step.id),
    currentStepIndex: prev.currentStepIndex + 1,
  };
  const events: LogEvent[] = [{ actor: 'Reader', event: `${verb} Step ${step.stepNumber}: ${step.title}` }];

  if (done && step.vitalsCheckRequired) {
    session.nextVitalsCheckAtIso = new Date(now + VITALS_CHECK_INTERVAL_MS).toISOString();
    events.push({ actor: 'Reader', event: `Vitals checked for ${patientName}; next check in ${VITALS_CHECK_INTERVAL_MS / 60000} min` });
  }
  if (session.currentStepIndex >= steps.length) {
    const s = summary(session);
    events.push({
      actor: 'System',
      event: `${CONDITION_LABELS[prev.condition]} checklist finished — ${s.done} done, ${s.skipped} skipped of ${s.total}`,
    });
  }
  return { session, events };
}

export const completeStep = (prev: EmergencySession, now: number, patientName: string) =>
  advance(prev, 'DONE', now, patientName);
export const skipStep = (prev: EmergencySession, now: number, patientName: string) =>
  advance(prev, "CAN'T DO", now, patientName);

export function previousStep(prev: EmergencySession): Transition | null {
  const index = Math.max(-1, prev.currentStepIndex - 1);
  if (index === prev.currentStepIndex) return null;
  const step = stepsOf(prev.condition)[index];
  return {
    session: { ...prev, currentStepIndex: index },
    events: [{ actor: 'Reader', event: step ? `Went back to Step ${step.stepNumber}` : 'Went back to Roles & Triage' }],
  };
}

/** Switches to another protocol and starts at its first step. Completed steps are kept (ids are unique per protocol). */
export function escalate(prev: EmergencySession, to: EmergencyCondition): Transition | null {
  if (to === prev.condition) return null;
  return {
    session: { ...prev, condition: to, currentStepIndex: 0 },
    events: [
      { actor: 'Reader', event: `Switched protocol: ${CONDITION_LABELS[prev.condition]} → ${CONDITION_LABELS[to]}` },
    ],
  };
}

/** Records a vitals check outside a checklist step and restarts the countdown. */
export function recordVitalsCheck(prev: EmergencySession, now: number, patientName: string): Transition {
  return {
    session: { ...prev, nextVitalsCheckAtIso: new Date(now + VITALS_CHECK_INTERVAL_MS).toISOString() },
    events: [{ actor: 'Reader', event: `Vitals checked for ${patientName}; next check in ${VITALS_CHECK_INTERVAL_MS / 60000} min` }],
  };
}

/** Titles of every step done so far, in the order they were done, across all protocols used. */
export function doneTitles(session: EmergencySession): string[] {
  return session.completedStepIds
    .map((id) => ALL_STEPS_BY_ID.get(id)?.title.replace(/\.$/, ''))
    .filter((t): t is string => !!t);
}

export function sendGroundMessage(
  prev: EmergencySession,
  crew: readonly CrewRef[],
  questions: string[],
  customNote: string | undefined,
  oneWayDelayMinutes: number,
  now: number,
): Transition {
  const patient = crew.find((c) => c.id === prev.patientId);
  const delayMs = oneWayDelayMinutes * 60 * 1000;
  const cleanQuestions = questions.filter((q) => q.trim().length > 0);
  const packet: GroundMessagePacket = {
    id: `pkt-${now}`,
    sentAtIso: new Date(now).toISOString(),
    arrivesAtIso: new Date(now + delayMs).toISOString(),
    earliestReplyAtIso: new Date(now + delayMs * 2).toISOString(),
    whatSummary: `${CONDITION_LABELS[prev.condition]} — ${patient?.name ?? 'Crew'}${customNote ? ` (${customNote})` : ''}`,
    vitalsSummary: patient
      ? `Heart ${patient.currentHr} | BP ${patient.currentBpSys}/${patient.currentBpDia} | O₂ ${patient.currentSpo2}%`
      : 'Vitals pending',
    doneSummary: doneTitles(prev).join(', ') || 'Initial triage & role assignment',
    questions: cleanQuestions,
    replyReadBack: false,
  };
  const groundPackets = prev.groundPackets ?? (prev.groundPacket ? [prev.groundPacket] : []);
  return {
    session: { ...prev, groundQuestions: cleanQuestions, groundPacket: packet, groundPackets: [...groundPackets, packet] },
    events: [{
      actor: 'Radio + log',
      event: `${groundPackets.length ? 'Re-sent updated' : 'Sent structured'} packet to Flight Surgeon (${oneWayDelayMinutes} min one-way delay)`,
    }],
  };
}

export function addGroundQuestion(prev: EmergencySession, question: string): Transition | null {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) return null;
  return {
    session: { ...prev, groundQuestions: [...(prev.groundQuestions ?? []), cleanQuestion] },
    events: [{ actor: 'Radio + log', event: 'Added a question to the Flight Surgeon packet draft.' }],
  };
}

export function confirmReadBack(prev: EmergencySession): Transition | null {
  if (!prev.groundPacket) return null;
  const groundPacket = { ...prev.groundPacket, replyReadBack: true };
  const groundPackets = prev.groundPackets ?? [prev.groundPacket];
  return {
    session: {
      ...prev,
      groundPacket,
      groundPackets: groundPackets.map((packet) => packet.id === groundPacket.id ? groundPacket : packet),
    },
    events: [{ actor: 'Reader', event: 'Flight Surgeon reply confirmed via crew read-back' }],
  };
}

export function endSession(prev: EmergencySession, now: number): Transition {
  return {
    session: { ...prev, endedAtIso: new Date(now).toISOString() },
    events: [{ actor: 'Crew', event: 'Emergency ended — incident log saved' }],
  };
}
