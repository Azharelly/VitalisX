import React, { useState } from 'react';
import { useEmergency } from './EmergencyProvider';
import type { CrewMemberSummary } from './EmergencyProvider';
import { EMERGENCY_PROTOCOLS, CONDITION_LABELS } from './protocols';
import type { EmergencyCondition } from './model';
import { HoldToEndButton } from './HoldToEndButton';
import styles from './emergency.module.css';

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatTimeHHMM(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

interface Props {
  crew: CrewMemberSummary[];
  oneWayDelayMinutes: number;
}

export const EmergencyScreen: React.FC<Props> = ({ crew, oneWayDelayMinutes }) => {
  const {
    session,
    elapsedSeconds,
    vitalsCountdownSeconds,
    isDrawerOpen,
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
  } = useEmergency();

  const [view, setView] = useState<'flow' | 'ground' | 'log'>('flow');
  const [questions, setQuestions] = useState<string[]>([
    'Start IV fluids?',
  ]);
  const [newQuestion, setNewQuestion] = useState('');
  const [checklistToast, setChecklistToast] = useState<string | null>(null);

  if (!isDrawerOpen || !session || session.endedAtIso) return null;

  const patient = crew.find((c) => c.id === session.patientId) ?? crew[0];
  const leader = crew.find((c) => c.id === session.roles.leaderId);
  const reader = crew.find((c) => c.id === session.roles.readerId);
  const radioLog = crew.find((c) => c.id === session.roles.radioLogId);

  const steps = EMERGENCY_PROTOCOLS[session.condition];
  const isRoleSetup = session.currentStepIndex < 0;
  const activeStep = !isRoleSetup ? steps[session.currentStepIndex] : null;

  const cycleRole = (role: 'leaderId' | 'readerId' | 'radioLogId') => {
    if (crew.length === 0) return;
    const currentIdx = crew.findIndex((c) => c.id === session.roles[role]);
    const nextCrew = crew[(currentIdx + 1) % crew.length];
    if (nextCrew) updateRole(role, nextCrew.id);
  };

  const handleAddQuestion = () => {
    if (!newQuestion.trim()) return;
    setQuestions((q) => [...q, newQuestion.trim()]);
    setNewQuestion('');
  };

  const handleSendPacket = () => {
    sendGroundMessage(questions);
  };

  const hrDelta = patient ? patient.currentHr - patient.baselineHr : 0;
  const bpDelta = patient ? patient.currentBpSys - patient.baselineBpSys : 0;

  return (
    <div
      className={`${styles.overlay} ${session.wallMode ? styles.wallLayout : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Emergency Protocol"
    >
      {/* Top Emergency Banner (CREW 9 #1, CREW 12 #5) */}
      <header className={styles.emergencyBanner}>
        <div className={styles.bannerLeft}>
          <span className={styles.stopOctagon} aria-hidden="true">⯃</span>
          <strong>EMERGENCY</strong>
          {!isRoleSetup && patient && (
            <span className={styles.patientTag}>
              · {patient.name} ({CONDITION_LABELS[session.condition].toLowerCase()})
            </span>
          )}
        </div>

        <div className={styles.bannerTimer} aria-live="off">
          {formatClock(elapsedSeconds)}
        </div>

        <div className={styles.bannerRight}>
          <span className={styles.loggingBadge}>logging</span>
          <button
            type="button"
            className={styles.wallToggleBtn}
            onClick={toggleWallMode}
            title="Switch between handheld and wall tablet landscape view"
          >
            {session.wallMode ? 'Handheld' : 'Wall view'}
          </button>
          <button
            type="button"
            className={styles.minimizeBtn}
            onClick={closeDrawer}
            title="Minimize (timer and logging continue)"
          >
            Hide
          </button>
        </div>
      </header>

      {/* Pinned Unread Reply Banner (CREW 11 #5) */}
      {session.groundPacket?.replyText && !session.groundPacket.replyReadBack && (
        <div className={styles.unreadReplyBanner} role="alert">
          <div>
            <strong>UNREAD FLIGHT SURGEON REPLY:</strong>{' '}
            {session.groundPacket.replyText}
          </div>
          <button
            type="button"
            className={styles.readBackBtn}
            onClick={confirmGroundReplyReadBack}
          >
            Confirm read-back ✓
          </button>
        </div>
      )}

      {/* Sub-navigation between Steps, Ground Packet, and Auto-Log */}
      <nav className={styles.subNav} aria-label="Emergency views">
        <button
          type="button"
          className={view === 'flow' ? styles.subNavActive : styles.subNavBtn}
          onClick={() => setView('flow')}
        >
          {isRoleSetup ? '1. Roles & Triage' : `Steps (${session.currentStepIndex + 1}/${steps.length})`}
        </button>
        <button
          type="button"
          className={view === 'ground' ? styles.subNavActive : styles.subNavBtn}
          onClick={() => setView('ground')}
        >
          Message to Ground ({oneWayDelayMinutes}m)
        </button>
        <button
          type="button"
          className={view === 'log' ? styles.subNavActive : styles.subNavBtn}
          onClick={() => setView('log')}
        >
          Auto-Log ({session.logEntries.length})
        </button>
      </nav>

      {/* VIEW 1: ROLES (CREW 9) OR ONE STEP AT A TIME (CREW 10 & 12) */}
      {view === 'flow' && isRoleSetup && (
        <main className={styles.mainBody}>
          <section className={styles.sectionBlock}>
            <h2 className={styles.sectionTitle}>Who is hurt?</h2>
            <div className={styles.chipGrid}>
              {crew.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className={
                    session.patientId === member.id ? styles.chipSelected : styles.chip
                  }
                  onClick={() => setPatient(member.id)}
                >
                  {member.name}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.sectionBlock}>
            <h2 className={styles.sectionTitle}>What do you see?</h2>
            <div className={styles.chipGrid}>
              {(Object.keys(CONDITION_LABELS) as EmergencyCondition[]).map((cond) => (
                <button
                  key={cond}
                  type="button"
                  className={
                    session.condition === cond ? styles.chipSelected : styles.chip
                  }
                  onClick={() => setCondition(cond)}
                >
                  {CONDITION_LABELS[cond]}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.sectionBlock}>
            <h2 className={styles.sectionTitle}>Who does what? (tap to change)</h2>
            <div className={styles.roleList}>
              <button
                type="button"
                className={styles.roleRow}
                onClick={() => cycleRole('leaderId')}
              >
                <span>Leader · hands on patient</span>
                <strong>{leader?.name ?? 'Assign'}</strong>
              </button>
              <button
                type="button"
                className={styles.roleRow}
                onClick={() => cycleRole('readerId')}
              >
                <span>Reader · reads steps aloud</span>
                <strong>{reader?.name ?? 'Assign'}</strong>
              </button>
              <button
                type="button"
                className={styles.roleRow}
                onClick={() => cycleRole('radioLogId')}
              >
                <span>Radio + log</span>
                <strong>{radioLog?.name ?? 'Assign'}</strong>
              </button>
            </div>
          </section>

          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.primaryActionBtn}
              onClick={startSteps}
            >
              Start the steps
            </button>
            <HoldToEndButton onConfirmEnd={endEmergency} />
          </div>
        </main>
      )}

      {view === 'flow' && !isRoleSetup && activeStep && (
        <main className={session.wallMode ? styles.wallGrid : styles.mainBody}>
          {/* Wall Mode Left Column: Persistent Roles (CREW 12 #3) */}
          {session.wallMode && (
            <aside className={styles.wallSidebar}>
              <h3>Who does what</h3>
              <div className={styles.wallRoleCard}>
                <div>Leader: <strong>{leader?.name}</strong></div>
                <div>Reader: <strong>{reader?.name}</strong></div>
                <div>Radio + Log: <strong>{radioLog?.name}</strong></div>
              </div>
              {session.groundPacket && (
                <div className={styles.wallDelayCard}>
                  <div>Earth {oneWayDelayMinutes} min</div>
                  <div>Reply from {formatTimeHHMM(session.groundPacket.earliestReplyAtIso)}</div>
                </div>
              )}
            </aside>
          )}

          {/* Center Column: Single Giant Step + Oversized DONE Button (CREW 10 #1-4) */}
          <section className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.readAloudTag}>
                Step {activeStep.stepNumber} of {steps.length} · read aloud
              </span>
              {session.completedStepIds.includes(activeStep.id) && (
                <span className={styles.doneBadge}>✓ Logged</span>
              )}
            </div>

            <h1 className={styles.stepTitle}>{activeStep.title}</h1>
            <p className={styles.stepDetail}>{activeStep.detail}</p>

            {activeStep.zeroGNote && (
              <p className={styles.zeroGCallout}>{activeStep.zeroGNote}</p>
            )}

            <button
              type="button"
              className={styles.giantDoneBtn}
              onClick={completeCurrentStep}
            >
              DONE · next step
            </button>

            <div className={styles.secondaryStepRow}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={skipCurrentStep}
              >
                Can&apos;t do
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={goPreviousStep}
              >
                Back
              </button>
            </div>

            <button
              type="button"
              className={styles.checklistHandoffBtn}
              onClick={() =>
                setChecklistToast(
                  `Opened Medical Checklist [${activeStep.checklistRefId}] — verify exact doses/volumes in official binder.`
                )
              }
            >
              Open Medical Checklist: {CONDITION_LABELS[session.condition].toLowerCase()} [
              {activeStep.checklistRefId}]
            </button>

            {checklistToast && (
              <div className={styles.checklistNotice} role="status">
                {checklistToast}
              </div>
            )}
          </section>

          {/* Right/Bottom Column: Patient Vitals vs Own In-Flight Normal (CREW 10 #5-7) */}
          {patient && (
            <aside className={styles.vitalsPanel}>
              <div className={styles.vitalsHeader}>
                <strong>{patient.name} compared with own normal</strong>
                <span className={styles.nextCheckTag}>
                  next check {formatClock(vitalsCountdownSeconds)}
                </span>
              </div>

              <div className={styles.vitalRow}>
                <span>Heart</span>
                <strong>{patient.currentHr}</strong>
                <span className={hrDelta > 15 ? styles.deltaWarn : styles.deltaNeutral}>
                  {hrDelta >= 0 ? `up ${hrDelta}` : `down ${Math.abs(hrDelta)}`}
                </span>
              </div>

              <div className={styles.vitalRow}>
                <span>Blood pressure</span>
                <strong>
                  {patient.currentBpSys}/{patient.currentBpDia}
                </strong>
                <span className={bpDelta < -15 ? styles.deltaWarn : styles.deltaNeutral}>
                  {bpDelta >= 0 ? `up ${bpDelta}` : `down ${Math.abs(bpDelta)}`}
                </span>
              </div>

              <div className={styles.vitalRow}>
                <span>Oxygen</span>
                <strong>{patient.currentSpo2}%</strong>
                <span className={styles.deltaNeutral}>
                  {patient.currentSpo2 === patient.baselineSpo2
                    ? 'same'
                    : `${patient.currentSpo2 - patient.baselineSpo2}%`}
                </span>
              </div>

              <div className={styles.groundFooterBar}>
                {session.groundPacket ? (
                  <>
                    <span>
                      Ground: sent {formatTimeHHMM(session.groundPacket.sentAtIso)} · reply
                      from {formatTimeHHMM(session.groundPacket.earliestReplyAtIso)}
                    </span>
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => setView('ground')}
                    >
                      Open packet
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    onClick={() => setView('ground')}
                  >
                    Prepare message to Flight Surgeon
                  </button>
                )}
              </div>
            </aside>
          )}
        </main>
      )}

      {/* VIEW 2: DELAY-AWARE MESSAGE TO GROUND (CREW 11) */}
      {view === 'ground' && (
        <main className={styles.mainBody}>
          <h2 className={styles.sectionTitle}>Message to flight surgeon</h2>

          <div className={styles.packetCard}>
            <p>
              <strong>What:</strong> {CONDITION_LABELS[session.condition]}, {patient?.name}{' '}
              {formatTimeHHMM(session.startedAtIso)}
            </p>
            <p>
              <strong>Now:</strong> Heart {patient?.currentHr} · BP {patient?.currentBpSys}/
              {patient?.currentBpDia} · Oxygen {patient?.currentSpo2}%
            </p>
            <p>
              <strong>Done:</strong>{' '}
              {session.completedStepIds.length > 0
                ? EMERGENCY_PROTOCOLS[session.condition]
                    .filter((s) => session.completedStepIds.includes(s.id))
                    .map((s) => s.title.replace(/\.$/, ''))
                    .join(', ')
                : 'Initial triage'}
            </p>
          </div>

          <section className={styles.sectionBlock}>
            <h3 className={styles.sectionTitle}>Our questions (clear &amp; numbered)</h3>
            <ol className={styles.questionList}>
              {questions.map((q, idx) => (
                <li key={idx}>{q}</li>
              ))}
            </ol>
            <div className={styles.addQuestionRow}>
              <input
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Add specific question for Flight Surgeon…"
                className={styles.questionInput}
              />
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleAddQuestion}
              >
                + Add
              </button>
            </div>
          </section>

          {session.groundPacket ? (
            <div className={styles.delayTimeline}>
              <div>
                <span>sent</span>
                <strong>{formatTimeHHMM(session.groundPacket.sentAtIso)}</strong>
              </div>
              <div>
                <span>arrives (+{oneWayDelayMinutes}m)</span>
                <strong>{formatTimeHHMM(session.groundPacket.arrivesAtIso)}</strong>
              </div>
              <div>
                <span>earliest reply (+{oneWayDelayMinutes * 2}m)</span>
                <strong>{formatTimeHHMM(session.groundPacket.earliestReplyAtIso)}</strong>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={styles.primaryActionBtn}
              onClick={handleSendPacket}
            >
              Send packet to Flight Surgeon
            </button>
          )}

          <p className={styles.autonomousReminder}>
            Do not wait. Keep following the steps.
          </p>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setView('flow')}
          >
            Back to the steps
          </button>
        </main>
      )}

      {/* VIEW 3: AUTOMATIC INCIDENT LOG (CREW 9 #1) */}
      {view === 'log' && (
        <main className={styles.mainBody}>
          <h2 className={styles.sectionTitle}>Automatic Incident Log</h2>
          <ul className={styles.auditList}>
            {session.logEntries.map((entry, idx) => (
              <li key={idx} className={styles.auditRow}>
                <code>+{formatClock(entry.elapsedSec)}</code>
                <span>
                  <strong>[{entry.actor}]</strong> {entry.event}
                </span>
              </li>
            ))}
          </ul>
          <HoldToEndButton onConfirmEnd={endEmergency} />
        </main>
      )}
    </div>
  );
};