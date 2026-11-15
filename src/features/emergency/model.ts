export type EmergencyCondition =
  | 'bleeding'
  | 'collapsed'
  | 'not_breathing'
  | 'very_low_sugar'
  | 'other';

export interface EmergencyRoleAssignment {
  leaderId: string;   // Hands on patient (defaults to crew medic)
  readerId: string;   // Holds tablet & reads steps aloud
  radioLogId: string; // Comms with Flight Surgeon & manual log notes
}

export interface EmergencyStep {
  id: string;
  stepNumber: number;
  title: string;
  detail: string;
  checklistRefId: string;
  zeroGNote?: string; // e.g., Never say "raise the legs" in microgravity
  vitalsCheckRequired?: boolean;
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
  currentStepIndex: number;
  completedStepIds: string[];
  skippedStepIds: string[];
  nextVitalsCheckAtIso: string;
  wallMode: boolean; // Toggles CREW 12 landscape layout
  groundPacket?: GroundMessagePacket;
  logEntries: Array<{
    timestampIso: string;
    elapsedSec: number;
    actor: string;
    event: string;
  }>;
}