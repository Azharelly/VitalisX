import { describe, expect, it } from 'vitest';
import type { EmergencyCondition, EmergencySession } from './model';
import { VITALS_CHECK_INTERVAL_MS } from './model';
import { ALL_STEPS_BY_ID, EMERGENCY_PROTOCOLS } from './protocols';
import { holdProgressPct, holdSecondsText } from './hold';
import { isMedicRole, pickRoles, reassignRole } from './roles';
import * as flow from './session';
import type { CrewRef } from './session';

const crew: CrewRef[] = ['1', '2', '3', '4'].map((id) => ({
  id,
  name: `Crew ${id}`,
  currentHr: 70,
  currentBpSys: 120,
  currentBpDia: 80,
  currentSpo2: 98,
}));
const T0 = Date.parse('2031-06-22T12:00:00Z');
const conditions = Object.keys(EMERGENCY_PROTOCOLS) as EmergencyCondition[];

/** Applies a transition the way the provider does: stamp the log, return the new session. */
function apply(t: flow.Transition | null, now: number): EmergencySession {
  if (!t) throw new Error('transition was null');
  return flow.stampLog(t.session, t.events, now);
}
const fresh = () => apply(flow.createSession(crew, '2', T0), T0);

describe('protocols', () => {
  it('has unique step ids and sequential step numbers', () => {
    const ids = conditions.flatMap((c) => EMERGENCY_PROTOCOLS[c].map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of conditions) {
      EMERGENCY_PROTOCOLS[c].forEach((s, i) => expect(s.stepNumber).toBe(i + 1));
    }
    expect(ALL_STEPS_BY_ID.size).toBe(ids.length);
  });

  it('every protocol ends by reassessing and updating the Flight Surgeon', () => {
    for (const c of conditions) {
      const steps = EMERGENCY_PROTOCOLS[c];
      expect(steps[steps.length - 1]!.title).toContain('Reassess');
    }
  });

  it('escalations point at a different, existing protocol', () => {
    for (const c of conditions) {
      for (const step of EMERGENCY_PROTOCOLS[c]) {
        for (const esc of step.escalations ?? []) {
          expect(conditions).toContain(esc.to);
          expect(esc.to === c).toBe(false);
        }
      }
    }
  });

  it('cardiac arrest starts compressions first, with the AED before breaths', () => {
    const [first, second, third] = EMERGENCY_PROTOCOLS.cardiac_arrest;
    expect(first!.title).toMatch(/compressions/i);
    expect(second!.title).toMatch(/AED/);
    expect(third!.title).toMatch(/breaths/i);
  });

  it('not breathing checks the pulse first and can switch to CPR', () => {
    const first = EMERGENCY_PROTOCOLS.not_breathing[0]!;
    expect(first.title).toMatch(/pulse/i);
    expect(first.escalations!.map((e) => e.to)).toContain('cardiac_arrest');
  });

  it('collapsed branches to CPR and to rescue breaths from the first step', () => {
    const targets = EMERGENCY_PROTOCOLS.collapsed[0]!.escalations!.map((e) => e.to);
    expect(targets).toContain('cardiac_arrest');
    expect(targets).toContain('not_breathing');
  });

  it('bleeding offers a tourniquet or packing before the IV kit', () => {
    const steps = EMERGENCY_PROTOCOLS.bleeding;
    const tourniquet = steps.findIndex((s) => /tourniquet/i.test(s.title));
    const iv = steps.findIndex((s) => /IV/.test(s.title));
    expect(tourniquet).toBeGreaterThan(-1);
    expect(tourniquet < iv).toBe(true);
  });

  it('low sugar confirms the glucose reading before treating', () => {
    const steps = EMERGENCY_PROTOCOLS.very_low_sugar;
    expect(steps[0]!.title).toMatch(/glucose/i);
    expect(steps.findIndex((s) => /Administer/.test(s.title))).toBeGreaterThan(0);
  });

  it('chest pain and fever leave medicine to the Medical Checklist and can escalate', () => {
    for (const c of ['chest_pain', 'fever'] as const) {
      const steps = EMERGENCY_PROTOCOLS[c];
      expect(steps.some((x) => /Medical Checklist/.test(x.title))).toBe(true);
      expect(steps.some((x) => x.escalations?.length)).toBe(true);
      expect(steps.some((x) => x.vitalsCheckRequired)).toBe(true);
    }
    expect(EMERGENCY_PROTOCOLS.chest_pain[0]!.escalations!.map((e) => e.to)).toContain('cardiac_arrest');
  });
});

describe('roles', () => {
  it('never gives the patient a role, and gives each role to a different person', () => {
    for (const patient of crew) {
      const r = pickRoles(crew, patient.id);
      const holders = [r.leaderId, r.readerId, r.radioLogId];
      expect(holders).not.toContain(patient.id);
      expect(new Set(holders).size).toBe(3);
    }
  });

  it('prefers a flagged medic as leader', () => {
    const withMedic = crew.map((c) => (c.id === '4' ? { ...c, isMedic: true } : c));
    expect(pickRoles(withMedic, '1').leaderId).toBe('4');
  });

  it('keeps valid preferred roles and replaces the one who became the patient', () => {
    const before = pickRoles(crew, '1');
    const after = pickRoles(crew, before.readerId, before);
    expect(after.leaderId).toBe(before.leaderId);
    expect(after.readerId === before.readerId).toBe(false);
    expect([after.leaderId, after.readerId, after.radioLogId]).not.toContain(before.readerId);
  });

  it('leaves roles empty when the patient is alone, and doubles up when there are few helpers', () => {
    expect(pickRoles([crew[0]!], '1')).toEqual({ leaderId: '', readerId: '', radioLogId: '' });
    const two = pickRoles([crew[0]!, crew[1]!], '1');
    expect([two.leaderId, two.readerId, two.radioLogId]).toEqual(['2', '2', '2']);
  });

  it('rejects the patient and swaps roles instead of double-booking someone', () => {
    const roles = pickRoles(crew, '1'); // 2 leads, 3 reads, 4 radio
    expect(reassignRole(roles, '1', 'readerId', '1')).toBeNull();
    const swapped = reassignRole(roles, '1', 'readerId', roles.leaderId)!;
    expect(swapped.readerId).toBe(roles.leaderId);
    expect(swapped.leaderId).toBe(roles.readerId);
  });

  it('recognises medical roles but not other crew roles', () => {
    expect(isMedicRole('Crew medical officer')).toBe(true);
    expect(isMedicRole('Flight surgeon')).toBe(true);
    expect(isMedicRole('Commander')).toBe(false);
    expect(isMedicRole('Systems engineer')).toBe(false);
  });
});

describe('session flow', () => {
  it('starts on the roles screen with the vitals timer running', () => {
    const s = fresh();
    expect(s.currentStepIndex).toBe(-1);
    expect(s.patientId).toBe('2');
    expect(s.nextVitalsCheckAtIso).toBe(new Date(T0 + VITALS_CHECK_INTERVAL_MS).toISOString());
    expect(s.logEntries).toHaveLength(1);
  });

  it('finishes the checklist once, then stops logging duplicate DONE entries', () => {
    let s = apply(flow.setCondition(fresh(), 'other'), T0);
    s = apply(flow.startSteps(s), T0);
    const total = EMERGENCY_PROTOCOLS.other.length;
    for (let i = 0; i < total; i++) s = apply(flow.completeStep(s, T0, 'Crew 2'), T0);
    expect(s.currentStepIndex).toBe(total);
    expect(s.completedStepIds).toHaveLength(total);
    const finishedLines = s.logEntries.filter((e) => e.event.includes('checklist finished'));
    expect(finishedLines).toHaveLength(1);
    // Past the end there is nothing left to complete or skip.
    expect(flow.completeStep(s, T0, 'Crew 2')).toBeNull();
    expect(flow.skipStep(s, T0, 'Crew 2')).toBeNull();
  });

  it('a step is either done or skipped, never both', () => {
    let s = apply(flow.setCondition(fresh(), 'collapsed'), T0);
    s = apply(flow.startSteps(s), T0);
    const id = EMERGENCY_PROTOCOLS.collapsed[0]!.id;
    s = apply(flow.skipStep(s, T0, 'Crew 2'), T0);
    expect(s.skippedStepIds).toContain(id);
    s = apply(flow.previousStep(s), T0);
    s = apply(flow.completeStep(s, T0, 'Crew 2'), T0);
    expect(s.completedStepIds).toContain(id);
    expect(s.skippedStepIds).not.toContain(id);
  });

  it('going back is logged and stops at the roles screen', () => {
    let s = apply(flow.setCondition(fresh(), 'other'), T0);
    s = apply(flow.startSteps(s), T0);
    const before = s.logEntries.length;
    s = apply(flow.previousStep(s), T0);
    expect(s.currentStepIndex).toBe(-1);
    expect(s.logEntries.length).toBe(before + 1);
    expect(flow.previousStep(s)).toBeNull();
  });

  it('a completed vitals step restarts the countdown; other steps do not', () => {
    let s = apply(flow.setCondition(fresh(), 'bleeding'), T0);
    s = apply(flow.startSteps(s), T0);
    const original = s.nextVitalsCheckAtIso;
    const later = T0 + 4 * 60 * 1000;
    s = apply(flow.completeStep(s, later, 'Crew 2'), later); // step 1: not a vitals step
    expect(s.nextVitalsCheckAtIso).toBe(original);
    const vitalsIndex = EMERGENCY_PROTOCOLS.bleeding.findIndex((x) => x.vitalsCheckRequired);
    while (s.currentStepIndex < vitalsIndex) s = apply(flow.completeStep(s, later, 'Crew 2'), later);
    s = apply(flow.completeStep(s, later, 'Crew 2'), later);
    expect(s.nextVitalsCheckAtIso).toBe(new Date(later + VITALS_CHECK_INTERVAL_MS).toISOString());
  });

  it('records a manual vitals check', () => {
    const later = T0 + 6 * 60 * 1000;
    const s = apply(flow.recordVitalsCheck(fresh(), later, 'Crew 2'), later);
    expect(s.nextVitalsCheckAtIso).toBe(new Date(later + VITALS_CHECK_INTERVAL_MS).toISOString());
  });

  it('escalating starts the new protocol at step 1 and keeps earlier progress', () => {
    let s = apply(flow.setCondition(fresh(), 'collapsed'), T0);
    s = apply(flow.startSteps(s), T0);
    s = apply(flow.completeStep(s, T0, 'Crew 2'), T0);
    s = apply(flow.escalate(s, 'cardiac_arrest'), T0);
    expect(s.condition).toBe('cardiac_arrest');
    expect(s.currentStepIndex).toBe(0);
    expect(s.completedStepIds).toContain('col-1');
    expect(flow.escalate(s, 'cardiac_arrest')).toBeNull();
    s = apply(flow.completeStep(s, T0, 'Crew 2'), T0);
    // The ground packet lists work from every protocol used, in the order it was done.
    expect(flow.doneTitles(s)).toHaveLength(2);
    expect(flow.doneTitles(s)[0]).toMatch(/responsiveness/i);
    expect(flow.doneTitles(s)[1]).toMatch(/compressions/i);
  });

  it('choosing a new patient moves anyone who held a role off it', () => {
    const s = fresh();
    const helper = s.roles.readerId;
    const after = apply(flow.setPatient(s, crew, helper), T0);
    expect([after.roles.leaderId, after.roles.readerId, after.roles.radioLogId]).not.toContain(helper);
  });

  it('times the ground packet from the one-way delay, including fractions of a minute', () => {
    const s = apply(flow.sendGroundMessage(fresh(), crew, ['Start IV fluids?', ' '], undefined, 12.5, T0), T0);
    const p = s.groundPacket!;
    expect(new Date(p.arrivesAtIso).getTime() - T0).toBe(12.5 * 60_000);
    expect(new Date(p.earliestReplyAtIso).getTime() - T0).toBe(25 * 60_000);
    expect(p.questions).toEqual(['Start IV fluids?']);
    expect(p.vitalsSummary).toContain('Heart 70');
  });

  it('adds a question and re-sends a revised packet without replacing packet history', () => {
    let s = apply(flow.sendGroundMessage(fresh(), crew, ['Start IV fluids?'], undefined, 12.5, T0), T0);
    s = apply(flow.addGroundQuestion(s, 'Should we repeat the reading?'), T0 + 30_000);
    s = apply(flow.sendGroundMessage(s, crew, s.groundQuestions, undefined, 12.5, T0 + 60_000), T0 + 60_000);

    expect(s.groundPackets).toHaveLength(2);
    expect(s.groundPackets?.[0]?.questions).toEqual(['Start IV fluids?']);
    expect(s.groundPacket?.questions).toEqual(['Start IV fluids?', 'Should we repeat the reading?']);
    expect(s.groundPacket?.sentAtIso).toBe(new Date(T0 + 60_000).toISOString());
  });

  it('starts on the chosen category, and never invents vitals that are missing', () => {
    const noData = crew.map((c) => (c.id === '2' ? { ...c, currentHr: null, currentBpSys: null, currentBpDia: null, currentSpo2: null } : c));
    const s = apply(flow.createSession(noData, '2', T0, 'fever'), T0);
    expect(s.condition).toBe('fever');
    const p = apply(flow.sendGroundMessage(s, noData, [], undefined, 12, T0), T0).groundPacket!;
    expect(p.vitalsSummary).toBe('Not measured yet');
  });

  it('sends the vitals measured during the emergency, with their time, instead of the check-in ones', () => {
    let s = fresh();
    expect(flow.latestVitalsSummary(s, crew[1])).toBe('Heart 70 · BP 120/80 · O₂ 98% (last check-in, not measured since)');
    const later = T0 + 3 * 60_000;
    s = apply(flow.recordVitalsCheck(s, later, 'Crew 2', { hr: 128, spo2: 93 }), later);
    expect(s.vitals).toHaveLength(1);
    expect(s.nextVitalsCheckAtIso).toBe(new Date(later + VITALS_CHECK_INTERVAL_MS).toISOString());
    expect(s.logEntries.at(-1)!.event).toContain('Heart 128 · O₂ 93%');
    const packet = apply(flow.sendGroundMessage(s, crew, [], undefined, 12, later), later).groundPacket!;
    expect(packet.vitalsSummary).toMatch(/^Heart 128 · O₂ 93% \(measured \d\d:\d\d\)$/);
    // "Checked" with no numbers restarts the countdown but stores no reading
    s = apply(flow.recordVitalsCheck(s, later + 60_000, 'Crew 2'), later + 60_000);
    expect(s.vitals).toHaveLength(1);
  });

  it('read-back needs a packet', () => {
    expect(flow.confirmReadBack(fresh())).toBeNull();
  });

  it('logs elapsed seconds from the start', () => {
    const s = apply(flow.setCondition(fresh(), 'other'), T0 + 90_000);
    expect(s.logEntries[s.logEntries.length - 1]!.elapsedSec).toBe(90);
  });
});

describe('hold to end', () => {
  it('measures progress against the duration and clamps to 0–100', () => {
    expect(holdProgressPct(1000, 1000, 2000)).toBe(0);
    expect(holdProgressPct(2000, 1000, 2000)).toBe(50);
    expect(holdProgressPct(3000, 1000, 2000)).toBe(100);
    expect(holdProgressPct(9000, 1000, 2000)).toBe(100);
  });

  it('never goes negative when the first frame is stamped before the press', () => {
    expect(holdProgressPct(995, 1000, 2000)).toBe(0);
  });

  it('treats a zero duration as already complete instead of dividing by zero', () => {
    expect(holdProgressPct(1000, 1000, 0)).toBe(100);
  });

  it('words the label from the real duration', () => {
    expect(holdSecondsText(2000)).toBe('2 seconds');
    expect(holdSecondsText(1000)).toBe('1 second');
    expect(holdSecondsText(1500)).toBe('1.5 seconds');
    expect(holdSecondsText(3000)).toBe('3 seconds');
  });
});
