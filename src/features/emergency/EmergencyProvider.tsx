import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { EmergencyCondition, EmergencyRoleAssignment, EmergencySession } from './model';
import * as flow from './session';
import type { Transition } from './session';
import { loadLatestEmergencySession, saveEmergencySession } from '../../data/emergencySessions';

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
  isReady: boolean;
  persistenceError: string | null;
  elapsedSeconds: number;
  /** Seconds until the next vitals check is due; 0 means due now (overdue). */
  vitalsCountdownSeconds: number;
  oneWayDelayMinutes: number;
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
  /** Jump to another protocol, e.g. "No pulse → start CPR". */
  escalateTo: (condition: EmergencyCondition) => void;
  /** Log a vitals check made outside a checklist step and restart the countdown. */
  recordVitalsCheck: () => void;
  toggleWallMode: () => void;
  sendGroundMessage: (questions: string[], customNote?: string) => void;
  addGroundQuestion: (question: string) => void;
  confirmGroundReplyReadBack: () => void;
  endEmergency: () => void;
}

const EmergencyContext = createContext<EmergencyContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useEmergency = () => {
  const ctx = useContext(EmergencyContext);
  if (!ctx) throw new Error('useEmergency must be used inside EmergencyProvider');
  return ctx;
};

interface Props {
  crew: CrewMemberSummary[];
  /** One-way Earth–crew delay in minutes (comes from mission config via the shell). */
  oneWayDelayMinutes: number;
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
  const [isReady, setIsReady] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // The ref is the source of truth for event handlers, so two quick taps never read stale state
  // and logging/persisting happens once per action, outside any state updater.
  const sessionRef = useRef<EmergencySession | null>(null);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Restore the latest emergency before allowing a new one to start. An active session opens
  // automatically, and its timer continues from the saved start time.
  useEffect(() => {
    let live = true;
    loadLatestEmergencySession().then(
      (restored) => {
        if (!live) return;
        sessionRef.current = restored;
        setSession(restored);
        setIsDrawerOpen(Boolean(restored && !restored.endedAtIso));
        setNowMs(Date.now());
        setIsReady(true);
      },
      (error: unknown) => {
        if (!live) return;
        console.error('Could not restore emergency data', error);
        setPersistenceError(error instanceof Error ? error.message : String(error));
        setIsReady(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  // 1-second tick for live emergency timer and vitals check countdown
  useEffect(() => {
    if (!session || session.endedAtIso) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session]);

  const commit = useCallback(
    (t: Transition, now: number) => {
      const next = flow.stampLog(t.session, t.events, now);
      sessionRef.current = next;
      setSession(next);
      setNowMs(now);
      persistenceQueueRef.current = persistenceQueueRef.current
        .catch(() => undefined)
        .then(() => saveEmergencySession(next))
        .then(() => setPersistenceError(null))
        .catch((error: unknown) => {
          console.error('Could not save emergency data', error);
          setPersistenceError(error instanceof Error ? error.message : String(error));
        });
      const timestampIso = new Date(now).toISOString();
      for (const e of t.events) onPersistLog?.({ timestampIso, event: e.event, sessionId: next.id });
    },
    [onPersistLog],
  );

  /** Runs one change on the open session. `make` returns null when the change does not apply. */
  const dispatch = useCallback(
    (make: (prev: EmergencySession, now: number) => Transition | null) => {
      const prev = sessionRef.current;
      if (!prev || prev.endedAtIso) return;
      const now = Date.now();
      const t = make(prev, now);
      if (t) commit(t, now);
    },
    [commit],
  );

  const patientName = (s: EmergencySession) => crew.find((c) => c.id === s.patientId)?.name ?? 'patient';

  // Pressing EMERGENCY starts timer and log immediately (CREW 8 #5, CREW 9 #1)
  const openEmergency = useCallback(
    (defaultPatientId?: string) => {
      if (!isReady) return;
      setIsDrawerOpen(true);
      const current = sessionRef.current;
      if (current && !current.endedAtIso) return; // already running: just reopen the drawer
      const now = Date.now();
      commit(flow.createSession(crew, defaultPatientId, now), now);
    },
    [crew, commit, isReady],
  );

  const closeDrawer = () => setIsDrawerOpen(false);

  const setPatient = (patientId: string) => dispatch((prev) => flow.setPatient(prev, crew, patientId));
  const setCondition = (condition: EmergencyCondition) => dispatch((prev) => flow.setCondition(prev, condition));
  const updateRole = (role: keyof EmergencyRoleAssignment, crewId: string) =>
    dispatch((prev) => flow.updateRole(prev, crew, role, crewId));
  const startSteps = () => dispatch((prev) => flow.startSteps(prev));
  const completeCurrentStep = () => dispatch((prev, now) => flow.completeStep(prev, now, patientName(prev)));
  const skipCurrentStep = () => dispatch((prev, now) => flow.skipStep(prev, now, patientName(prev)));
  const goPreviousStep = () => dispatch((prev) => flow.previousStep(prev));
  const escalateTo = (condition: EmergencyCondition) => dispatch((prev) => flow.escalate(prev, condition));
  const recordVitalsCheck = () => dispatch((prev, now) => flow.recordVitalsCheck(prev, now, patientName(prev)));

  const toggleWallMode = () => {
    const prev = sessionRef.current;
    if (!prev) return;
    const next = { ...prev, wallMode: !prev.wallMode };
    sessionRef.current = next;
    setSession(next);
    persistenceQueueRef.current = persistenceQueueRef.current
      .catch(() => undefined)
      .then(() => saveEmergencySession(next))
      .then(() => setPersistenceError(null))
      .catch((error: unknown) => {
        console.error('Could not save emergency data', error);
        setPersistenceError(error instanceof Error ? error.message : String(error));
      });
  };

  const sendGroundMessage = (questions: string[], customNote?: string) =>
    dispatch((prev, now) => flow.sendGroundMessage(prev, crew, questions, customNote, oneWayDelayMinutes, now));
  const addGroundQuestion = (question: string) =>
    dispatch((prev) => flow.addGroundQuestion(prev, question));
  const confirmGroundReplyReadBack = () => dispatch((prev) => flow.confirmReadBack(prev));

  const endEmergency = () => {
    dispatch((prev, now) => flow.endSession(prev, now));
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
        isReady,
        persistenceError,
        elapsedSeconds,
        vitalsCountdownSeconds,
        oneWayDelayMinutes,
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
        escalateTo,
        recordVitalsCheck,
        toggleWallMode,
        sendGroundMessage,
        addGroundQuestion,
        confirmGroundReplyReadBack,
        endEmergency,
      }}
    >
      {children}
    </EmergencyContext.Provider>
  );
};
