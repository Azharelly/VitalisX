import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { EmergencyCondition, EmergencyRoleAssignment, EmergencySession, VitalsReading } from './model';
import * as flow from './session';
import type { Transition } from './session';
import { loadLatestEmergencySession, saveEmergencySession } from '../../data/emergencySessions';
import type { TodayView } from '../today/model';
import { pickRoles } from './roles';

export interface CrewMemberSummary extends flow.CrewRef {
  role: string;
  /** The person's Today view: the emergency summary (alerts, vitals against usual, check-in). Absent while loading. */
  today?: TodayView;
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
  /** Who is preselected on the "who needs help?" step (the person on screen when EMERGENCY was pressed). */
  armedPatientId?: string;
  /** True right after "End emergency": the screen shows what happened until it is closed. */
  justEnded: boolean;
  /** Opens the emergency. Nothing starts until someone picks who and what (room to back out, dossier F-08). */
  openEmergency: (defaultPatientId?: string) => void;
  /** Starts timer and log, straight on step 1. */
  startEmergency: (patientId: string, condition: EmergencyCondition) => void;
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
  /** Log a vitals check (with numbers when measured) and restart the countdown. */
  recordVitalsCheck: (values?: Omit<VitalsReading, 'atIso'>) => void;
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
  const [armedPatientId, setArmedPatientId] = useState<string>();
  const [justEnded, setJustEnded] = useState(false);
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

  // A session saved with no crew loaded (or an old one) can hold empty or stale roles: fill them once the crew is known.
  useEffect(() => {
    const prev = sessionRef.current;
    if (!prev || prev.endedAtIso || crew.length === 0 || !crew.some((c) => c.id === prev.patientId)) return;
    const roles = pickRoles(crew, prev.patientId, prev.roles);
    if (roles.leaderId === prev.roles.leaderId && roles.readerId === prev.roles.readerId && roles.radioLogId === prev.roles.radioLogId) return;
    const now = Date.now();
    commit({ session: { ...prev, roles }, events: [{ actor: 'System', event: 'Roles filled in from the crew list' }] }, now);
  }, [crew, commit, session]);

  // Keep the screen on while an emergency runs: a tablet that dims mid-CPR costs time. Browsers drop the lock when
  // the page is hidden, so it is asked for again on return. Unsupported or refused: nothing changes.
  const running = !!session && !session.endedAtIso;
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (l) => (live ? (lock = l) : void l.release().catch(() => undefined)), // ended while asking: let go
        () => undefined,
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => undefined);
    };
  }, [running]);

  // Pressing EMERGENCY only opens the screen; an active one is reopened, never duplicated (dossier F-08).
  const openEmergency = useCallback(
    (defaultPatientId?: string) => {
      if (!isReady) return;
      setArmedPatientId(defaultPatientId);
      setJustEnded(false);
      setIsDrawerOpen(true);
    },
    [isReady],
  );

  const startEmergency = (patientId: string, condition: EmergencyCondition) => {
    const current = sessionRef.current;
    if ((current && !current.endedAtIso) || !crew.some((c) => c.id === patientId)) return;
    const now = Date.now();
    const created = flow.createSession(crew, patientId, now, condition);
    const started = flow.startSteps(created.session);
    commit({ session: started.session, events: [...created.events, ...started.events] }, now);
  };

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
  const recordVitalsCheck = (values?: Omit<VitalsReading, 'atIso'>) =>
    dispatch((prev, now) => flow.recordVitalsCheck(prev, now, patientName(prev), values));

  const sendGroundMessage = (questions: string[], customNote?: string) =>
    dispatch((prev, now) => flow.sendGroundMessage(prev, crew, questions, customNote, oneWayDelayMinutes, now));
  const addGroundQuestion = (question: string) =>
    dispatch((prev) => flow.addGroundQuestion(prev, question));
  const confirmGroundReplyReadBack = () => dispatch((prev) => flow.confirmReadBack(prev));

  // The screen stays open on "What happened" until the crew closes it.
  const endEmergency = () => {
    dispatch((prev, now) => flow.endSession(prev, now));
    setJustEnded(true);
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
        armedPatientId,
        justEnded,
        openEmergency,
        startEmergency,
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
