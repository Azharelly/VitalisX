export type EmergencyCondition =
  | 'bleeding'
  | 'collapsed'
  | 'not_breathing'
  | 'cardiac_arrest'
  | 'very_low_sugar'
  | 'other';

/** How often the patient's vitals should be re-checked while an emergency is open. */
export const VITALS_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface EmergencyRoleAssignment {
  leaderId: string;   // Hands on patient (defaults to crew medic)
  readerId: string;   // Holds tablet & reads steps aloud
  radioLogId: string; // Comms with Flight Surgeon & manual log notes
}

/** A one-tap jump to another protocol, shown under a step ("No pulse → start CPR"). */
export interface EmergencyEscalation {
  to: EmergencyCondition;
  label: string;
}

export interface EmergencyStep {
  id: string;
  stepNumber: number;
  title: string;
  detail: string;
  checklistRefId: string;
  zeroGNote?: string; // e.g., Never say "raise the legs" in microgravity
  vitalsCheckRequired?: boolean;
  /** Findings at this step that mean a different protocol applies right now. */
  escalations?: EmergencyEscalation[];
}

export interface GroundMessagePacket {
  id: string;
  sentAtIso: string;
  arrivesAtIso: string;       // sentAt + oneWayDelayMin
  earliestReplyAtIso: string; // sentAt + (oneWayDelayMin * 2)
  whatSummary: string;
  vitalsSummary: string;
  doneSummary: string;
  questions: string[];
  replyText?: string;
  replyReadBack: boolean;     // Stays unread until explicitly confirmed
}

export interface EmergencySession {
  id: string;
  startedAtIso: string;
  endedAtIso?: string;
  patientId: string;
  condition: EmergencyCondition;
  roles: EmergencyRoleAssignment;
  /**
   * -1 = Roles & Triage screen.
   * 0..n-1 = the step being read aloud.
   * n (= steps.length) = every step has been done or skipped (checklist finished).
   */
  currentStepIndex: number;
  completedStepIds: string[]; // in the order they were completed
  skippedStepIds: string[];
  nextVitalsCheckAtIso: string;
  wallMode: boolean; // Toggles CREW 12 landscape layout
  groundQuestions: string[]; // editable packet draft, saved with the emergency
  groundPacket?: GroundMessagePacket;
  groundPackets?: GroundMessagePacket[]; // sent packet history; groundPacket remains the latest packet
  logEntries: Array<{
    timestampIso: string;
    elapsedSec: number;
    actor: string;
    event: string;
  }>;
}
