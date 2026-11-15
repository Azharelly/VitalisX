import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  EmergencyCondition,
  EmergencyRoleAssignment,
  EmergencySession,
  GroundMessagePacket,
} from './model';
import { EMERGENCY_PROTOCOLS, CONDITION_LABELS } from './protocols';

export interface CrewMemberSummary {
  id: string;
  name: string;
  isMedic?: boolean;
  baselineHr: number;
  baselineBpSys: number;
  baselineBpDia: number;
  baselineSpo2: number;
  currentHr: number;
  currentBpSys: number;
  currentBpDia: number;
  currentSpo2: number;
}

interface EmergencyContextValue {
  crew: CrewMemberSummary[];
  session: EmergencySession | null;
  elapsedSeconds: number;
  vitalsCountdownSeconds: number;
  isDrawerOpen: boolean;
  openEmergency: (defaultPatientId?: string) => void;
  closeDrawer: () => void;
  setPatient: (patientId: string) => void;
  setCondition: (condition: EmergencyCondition) => void;
  updateRole: (role: keyof EmergencyRoleAssignment, crewId: string) => void;
  startSteps: () => void;
  completeCurrentStep: () => void;
  skipCurrentStep: () => void;
  goPreviousStep: () => void;
  toggleWallMode: () => void;
  sendGroundMessage: (questions: string[], customNote?: string) => void;
  confirmGroundReplyReadBack: () => void;
  endEmergency: () => void;
}

const EmergencyContext = createContext<EmergencyContextValue | null>(null);

export const useEmergency = () => {
  const ctx = useContext(EmergencyContext);
  if (!ctx) throw new Error('useEmergency must be used inside EmergencyProvider');
  return ctx;
};

interface Props {
  crew: CrewMemberSummary[];
  oneWayDelayMinutes: number; // e.g. 12 min from top status bar
  onPersistLog?: (entry: { timestampIso: string; event: string; sessionId: string }) => void;
  children: React.ReactNode;
}

export const EmergencyProvider: React.FC<Props> = ({
  crew,
  oneWayDelayMinutes,
  onPersistLog,
  children,
}) => {
  const [session, setSession] = useState<EmergencySession | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 1-second tick for live emergency timer and vitals check countdown
  useEffect(() => {
    if (!session || session.endedAtIso) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session]);

  const appendLog = useCallback(
    (current: EmergencySession, actor: string, event: string): EmergencySession => {
      const timestampIso = new Date().toISOString();
      const elapsedSec = Math.max(
        0,
        Math.floor((Date.now() - new Date(current.startedAtIso).getTime()) / 1000)
      );
      onPersistLog?.({ timestampIso, event, sessionId: current.id });
      return {
        ...current,
        logEntries: [...current.logEntries, { timestampIso, elapsedSec, actor, event }],
      };
    },
    [onPersistLog]
  );

  // Pressing EMERGENCY starts timer and log immediately (CREW 8 #5, CREW 9 #1)
  const openEmergency = useCallback(
    (defaultPatientId?: string) => {
      setIsDrawerOpen(true);
      setSession((prev) => {
        if (prev && !prev.endedAtIso) return prev;

        const patient =
          crew.find((c) => c.id === defaultPatientId) ?? crew[1] ?? crew[0];
        const medic =
          crew.find((c) => c.isMedic && c.id !== patient?.id) ??
          crew.find((c) => c.isMedic) ??
          crew[0];
        const reader =
          crew.find((c) => c.id !== patient?.id && c.id !== medic?.id) ?? crew[0];
        const radio =
          crew.find(
            (c) => c.id !== patient?.id && c.id !== medic?.id && c.id !== reader?.id
          ) ?? reader;

        const startedAtIso = new Date().toISOString();
        const nextVitalsCheckAtIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const id = `emg-${Date.now()}`;

        onPersistLog?.({
          timestampIso: startedAtIso,
          event: 'EMERGENCY activated — timer and auto-log started',
          sessionId: id,
        });

        return {
          id,
          startedAtIso,
          patientId: patient?.id ?? 'unknown',
          condition: 'bleeding',
          roles: {
            leaderId: medic?.id ?? '',
            readerId: reader?.id ?? '',
            radioLogId: radio?.id ?? '',
          },
          currentStepIndex: -1, // -1 = Role & Triage screen (CREW 9)
          completedStepIds: [],
          skippedStepIds: [],
          nextVitalsCheckAtIso,
          wallMode: false,
          logEntries: [
            {
              timestampIso: startedAtIso,
              elapsedSec: 0,
              actor: 'System',
              event: 'Emergency triggered. Patient readings opened to crew.',
            },
          ],
        };
      });
    },
    [crew, onPersistLog]
  );

  const closeDrawer = () => setIsDrawerOpen(false);

  const setPatient = (patientId: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const pName = crew.find((c) => c.id === patientId)?.name ?? patientId;
      // Re-suggest leader if current leader was selected as patient
      const nextRoles = { ...prev.roles };
      if (nextRoles.leaderId === patientId) {
        const altMedic = crew.find((c) => c.isMedic && c.id !== patientId) ??
          crew.find((c) => c.id !== patientId);
        if (altMedic) nextRoles.leaderId = altMedic.id;
      }
      return appendLog(
        { ...prev, patientId, roles: nextRoles },
        'Crew',
        `Patient set to ${pName}`
      );
    });
  };

  const setCondition = (condition: EmergencyCondition) => {
    setSession((prev) => {
      if (!prev) return prev;
      return appendLog(
        { ...prev, condition, currentStepIndex: -1 },
        'Crew',
        `Condition selected: ${CONDITION_LABELS[condition]}`
      );
    });
  };

  const updateRole = (role: keyof EmergencyRoleAssignment, crewId: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const cName = crew.find((c) => c.id === crewId)?.name ?? crewId;
      return appendLog(
        { ...prev, roles: { ...prev.roles, [role]: crewId } },
        'Crew',
        `Role ${role} assigned to ${cName}`
      );
    });
  };

  const startSteps = () => {
    setSession((prev) => {
      if (!prev) return prev;
      return appendLog(
        { ...prev, currentStepIndex: 0 },
        'Reader',
        `Started ${CONDITION_LABELS[prev.condition]} checklist (Step 1)`
      );
    });
  };

  const completeCurrentStep = () => {
    setSession((prev) => {
      if (!prev) return prev;
      const steps = EMERGENCY_PROTOCOLS[prev.condition];
      const step = steps[prev.currentStepIndex];
      if (!step) return prev;
      const nextIndex = Math.min(prev.currentStepIndex + 1, steps.length - 1);
      const updated = appendLog(
        {
          ...prev,
          completedStepIds: Array.from(new Set([...prev.completedStepIds, step.id])),
          currentStepIndex: nextIndex,
        },
        'Reader',
        `DONE Step ${step.stepNumber}: ${step.title}`
      );
      return updated;
    });
  };

  const skipCurrentStep = () => {
    setSession((prev) => {
      if (!prev) return prev;
      const steps = EMERGENCY_PROTOCOLS[prev.condition];
      const step = steps[prev.currentStepIndex];
      if (!step) return prev;
      const nextIndex = Math.min(prev.currentStepIndex + 1, steps.length - 1);
      return appendLog(
        {
          ...prev,
          skippedStepIds: Array.from(new Set([...prev.skippedStepIds, step.id])),
          currentStepIndex: nextIndex,
        },
        'Reader',
        `CAN'T DO Step ${step.stepNumber}: ${step.title}`
      );
    });
  };

  const goPreviousStep = () => {
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        currentStepIndex: Math.max(-1, prev.currentStepIndex - 1),
      };
    });
  };

  const toggleWallMode = () => {
    setSession((prev) => (prev ? { ...prev, wallMode: !prev.wallMode } : prev));
  };

  const sendGroundMessage = (questions: string[], customNote?: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const patient = crew.find((c) => c.id === prev.patientId);
      const sentMs = Date.now();
      const delayMs = oneWayDelayMinutes * 60 * 1000;

      const completedTitles = EMERGENCY_PROTOCOLS[prev.condition]
        .filter((s) => prev.completedStepIds.includes(s.id))
        .map((s) => s.title.replace(/\.$/, ''))
        .join(', ');

      const packet: GroundMessagePacket = {
        id: `pkt-${sentMs}`,
        sentAtIso: new Date(sentMs).toISOString(),
        arrivesAtIso: new Date(sentMs + delayMs).toISOString(),
        earliestReplyAtIso: new Date(sentMs + delayMs * 2).toISOString(),
        whatSummary: `${CONDITION_LABELS[prev.condition]} — ${patient?.name ?? 'Crew'}${
          customNote ? ` (${customNote})` : ''
        }`,
        vitalsSummary: patient
          ? `Heart ${patient.currentHr} | BP ${patient.currentBpSys}/${patient.currentBpDia} | O₂ ${patient.currentSpo2}%`
          : 'Vitals pending',
        doneSummary: completedTitles || 'Initial triage & role assignment',
        questions: questions.filter((q) => q.trim().length > 0),
        replyReadBack: false,
      };

      return appendLog(
        { ...prev, groundPacket: packet },
        'Radio + log',
        `Sent structured packet to Flight Surgeon (${oneWayDelayMinutes} min one-way delay)`
      );
    });
  };

  const confirmGroundReplyReadBack = () => {
    setSession((prev) => {
      if (!prev?.groundPacket) return prev;
      return appendLog(
        {
          ...prev,
          groundPacket: { ...prev.groundPacket, replyReadBack: true },
        },
        'Reader',
        'Flight Surgeon reply confirmed via crew read-back'
      );
    });
  };

  const endEmergency = () => {
    setSession((prev) => {
      if (!prev) return null;
      const closed = appendLog(
        { ...prev, endedAtIso: new Date().toISOString() },
        'Crew',
        'Emergency ended — incident log saved'
      );
      return closed;
    });
    setIsDrawerOpen(false);
  };

  const elapsedSeconds = session
    ? Math.max(
        0,
        Math.floor(
          ((session.endedAtIso ? new Date(session.endedAtIso).getTime() : nowMs) -
            new Date(session.startedAtIso).getTime()) /
            1000
        )
      )
    : 0;

  const vitalsCountdownSeconds = session
    ? Math.max(
        0,
        Math.floor((new Date(session.nextVitalsCheckAtIso).getTime() - nowMs) / 1000)
      )
    : 0;

  return (
    <EmergencyContext.Provider
      value={{
        crew,
        session,
        elapsedSeconds,
        vitalsCountdownSeconds,
        isDrawerOpen,
        openEmergency,
        closeDrawer,
        setPatient,
        setCondition,
        updateRole,
        startSteps,
        completeCurrentStep,
        skipCurrentStep,
        goPreviousStep,
        toggleWallMode,
        sendGroundMessage,
        confirmGroundReplyReadBack,
        endEmergency,
      }}
    >
      {children}
    </EmergencyContext.Provider>
  );
};