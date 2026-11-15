import React, { useEffect, useRef, useState } from 'react';
import { useEmergency } from './EmergencyProvider';
import type { CrewMemberSummary } from './EmergencyProvider';
import { EMERGENCY_PROTOCOLS, CONDITION_LABELS, EXAMPLE_CONTENT_NOTE } from './protocols';
import { doneTitles, latestVitalsSummary } from './session';
import type { EmergencyCondition, EmergencyRoleAssignment, VitalsReading } from './model';
import { FIELDS, parseNumber } from '../checkin/model';
import { HoldToEndButton } from './HoldToEndButton';
import { LEVEL_WORD, formatValue, isFlagged, type Reading } from '../today/model';
import { StatusIcon } from '../today/StatusIcon';
import t from '../today/today.module.css';
import s from './emergency.module.css';

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

function formatTimeHHMM(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

const formatMinutes = (min: number) => (Number.isInteger(min) ? String(min) : min.toFixed(1));
const firstName = (name: string) => name.split(' ')[0] ?? name;
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const CONDITIONS = Object.keys(CONDITION_LABELS) as EmergencyCondition[];

/** Fixed notice (dossier F-08, D13): always on screen while the emergency view is open. */
const NOTICE = 'Decision support only. Follow your mission’s emergency procedures. This app does not call anyone.';

const ROLES: { key: keyof EmergencyRoleAssignment; label: string }[] = [
  { key: 'leaderId', label: 'Lead · hands on patient' },
  { key: 'readerId', label: 'Reader · reads the steps aloud' },
  { key: 'radioLogId', label: 'Radio and log' },
];

interface Props {
  crew: CrewMemberSummary[];
  oneWayDelayMinutes: number;
}

export const EmergencyScreen: React.FC<Props> = ({ crew, oneWayDelayMinutes }) => {
  const em = useEmergency();
  const { session, isDrawerOpen, justEnded, closeDrawer } = em;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<'flow' | 'ground' | 'log'>('flow');
  const [vitalsOpen, setVitalsOpen] = useState(false);

  const active = !!session && !session.endedAtIso;
  const mode = active ? 'active' : justEnded && session ? 'ended' : 'armed';

  // Lock the page behind and land focus on the heading.
  useEffect(() => {
    if (!isDrawerOpen) return;
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    if (isDrawerOpen) headingRef.current?.focus({ preventScroll: true });
  }, [isDrawerOpen, mode, view]);

  if (!isDrawerOpen) return null;

  // Hiding keeps the timer and log running; the next opening starts on the steps.
  const hide = () => {
    setView('flow');
    setVitalsOpen(false);
    closeDrawer();
  };
  const openVitals = () => {
    setView('flow');
    setVitalsOpen(true);
  };
  const vitalsDue = mode === 'active' && em.vitalsCountdownSeconds === 0;

  const patient = session ? crew.find((c) => c.id === session.patientId) : undefined;
  const condition = session ? CONDITION_LABELS[session.condition] : '';

  return (
    <div
      className={`${t.theme} ${s.overlay}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="em-heading"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && mode === 'active') hide();
        else if (e.key === 'Escape') closeDrawer();
      }}
    >
      <header className={s.top}>
        <div className={`${s.bar} ${mode === 'ended' ? s.barEnded : ''}`}>
          <span className={`${s.barMark} ${t.alert}`}>
            <StatusIcon level="alert" />
          </span>
          {/* Two lines, so who and what are never cut off on a phone. */}
          <p className={s.barTitle}>
            <strong>{mode === 'ended' ? 'Emergency ended' : 'Emergency'}</strong>
            <span className={s.barWho}>
              {mode === 'armed' ? 'Not started yet' : patient ? `${patient.name} · ${condition}` : condition}
            </span>
          </p>
          {mode === 'active' && (
            <span className={s.timer} role="timer" aria-label={`Running for ${formatClock(em.elapsedSeconds)}`}>
              {formatClock(em.elapsedSeconds)}
            </span>
          )}
          {mode === 'active' && (
            <button type="button" className={s.barBtn} onClick={hide} title="Hide this screen. The timer and log keep running.">
              Hide
            </button>
          )}
          {mode === 'armed' && (
            <button type="button" className={s.barBtn} onClick={closeDrawer}>
              Cancel
            </button>
          )}
        </div>
        {vitalsDue && (
          <div className={s.dueStrip} role="status">
            <span>
              <StatusIcon level="alert" /> Vitals due now
            </span>
            <button type="button" className={s.dueBtn} onClick={openVitals}>
              Record vitals
            </button>
          </div>
        )}
      </header>

      <p className={s.notice}>{NOTICE}</p>
      {em.persistenceError && (
        <p className={s.warning} role="alert">
          This emergency could not be saved on this device. Keep this screen open.
        </p>
      )}

      <div className={s.body}>
        {mode === 'armed' && <Armed crew={crew} headingRef={headingRef} />}
        {mode === 'ended' && session && <Ended crew={crew} headingRef={headingRef} />}
        {mode === 'active' && session && (
          <>
            {session.groundPacket?.replyText && !session.groundPacket.replyReadBack && (
              <div className={s.reply} role="alert">
                <p>
                  <strong>Flight surgeon replied:</strong> {session.groundPacket.replyText}
                </p>
                <button type="button" className={t.primaryBtn} onClick={em.confirmGroundReplyReadBack}>
                  Read back to crew ✓
                </button>
              </div>
            )}
            {view === 'flow' && (
              <Flow
                crew={crew}
                headingRef={headingRef}
                oneWayDelayMinutes={oneWayDelayMinutes}
                onGround={() => setView('ground')}
                onLog={() => setView('log')}
                vitalsOpen={vitalsOpen}
                setVitalsOpen={setVitalsOpen}
              />
            )}
            {view === 'ground' && <Ground crew={crew} headingRef={headingRef} oneWayDelayMinutes={oneWayDelayMinutes} onBack={() => setView('flow')} />}
            {view === 'log' && <Log headingRef={headingRef} onBack={() => setView('flow')} />}
          </>
        )}
      </div>
    </div>
  );
};

type HeadingRef = React.RefObject<HTMLHeadingElement | null>;

/* ── Before it starts: who and what. Nothing is saved until a category is chosen. ── */
function Armed({ crew, headingRef }: { crew: CrewMemberSummary[]; headingRef: HeadingRef }) {
  const { armedPatientId, startEmergency, closeDrawer } = useEmergency();
  const [who, setWho] = useState(() => (crew.some((c) => c.id === armedPatientId) ? armedPatientId : undefined));

  return (
    <div className={s.page}>
      <h1 id="em-heading" ref={headingRef} tabIndex={-1} className={s.title}>
        Who needs help?
      </h1>
      {crew.length === 0 ? (
        <p className={t.muted}>Loading the crew…</p>
      ) : (
        <div className={s.tiles} role="group" aria-label="Who needs help">
          {crew.map((c) => (
            <PersonTile key={c.id} person={c} pressed={who === c.id} onClick={() => setWho(c.id)} />
          ))}
        </div>
      )}

      <h2 className={s.subtitle}>What is happening?</h2>
      {who ? (
        <div className={s.chips} role="group" aria-label="What is happening">
          {CONDITIONS.map((c) => (
            <button key={c} type="button" className={s.chip} onClick={() => startEmergency(who, c)}>
              {CONDITION_LABELS[c]}
            </button>
          ))}
        </div>
      ) : (
        <p className={t.muted}>Tap the person first.</p>
      )}
      <p className={s.hint}>The timer and the log start when you choose what is happening. Nothing is saved before that.</p>

      <div>
        <button type="button" className={t.ghostBtn} onClick={closeDrawer}>
          Not an emergency, go back
        </button>
      </div>
    </div>
  );
}

function PersonTile({ person, pressed, onClick }: { person: CrewMemberSummary; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" className={s.tile} aria-pressed={pressed} onClick={onClick}>
      <span className={s.avatar} aria-hidden="true">
        {initials(person.name)}
      </span>
      <span className={s.tileName}>{person.name}</span>
      <span className={s.tileRole}>{person.role || 'Crew'}</span>
    </button>
  );
}

/* ── While it runs: one step at a time, with roles, the patient and the flight surgeon beside it. ── */
function Flow({ crew, headingRef, oneWayDelayMinutes, onGround, onLog, vitalsOpen, setVitalsOpen }: {
  crew: CrewMemberSummary[]; headingRef: HeadingRef; oneWayDelayMinutes: number; onGround: () => void; onLog: () => void;
  vitalsOpen: boolean; setVitalsOpen: (open: boolean) => void;
}) {
  const em = useEmergency();
  const session = em.session!;
  const patient = crew.find((c) => c.id === session.patientId);
  const steps = EMERGENCY_PROTOCOLS[session.condition];
  const index = session.currentStepIndex;
  const step = index >= 0 ? steps[index] : undefined;
  const finished = index >= steps.length;

  // Back from step 1, or a saved emergency whose patient is no longer in the crew: change who or what.
  if (index < 0 || !patient) {
    return (
      <div className={s.page}>
        <h1 id="em-heading" ref={headingRef} tabIndex={-1} className={s.title}>
          {patient ? 'Change who or what' : 'Who needs help?'}
        </h1>
        <div className={s.tiles} role="group" aria-label="Who needs help">
          {crew.map((c) => (
            <PersonTile key={c.id} person={c} pressed={session.patientId === c.id} onClick={() => em.setPatient(c.id)} />
          ))}
        </div>
        <h2 className={s.subtitle}>What is happening?</h2>
        <div className={s.chips} role="group" aria-label="What is happening">
          {CONDITIONS.map((c) => (
            <button key={c} type="button" className={s.chip} aria-pressed={session.condition === c} onClick={() => em.setCondition(c)}>
              {CONDITION_LABELS[c]}
            </button>
          ))}
        </div>
        <div className={s.row}>
          <button type="button" className={s.doneBtn} disabled={!patient} onClick={em.startSteps}>
            Go to step 1
          </button>
        </div>
      </div>
    );
  }

  const completed = steps.filter((x) => session.completedStepIds.includes(x.id)).length;
  const skipped = steps.filter((x) => session.skippedStepIds.includes(x.id));

  return (
    <div className={s.grid}>
      <section className={`${t.next} ${t.alert} ${s.stepCard}`} aria-labelledby="em-heading">
        {step && (
          <>
            <div className={t.nextHead}>
              <span className={t.eyebrow}>
                Step {step.stepNumber} of {steps.length} · read aloud
              </span>
              {session.completedStepIds.includes(step.id) && <span className={`${t.badge} ${t.ok}`}>Done before</span>}
            </div>
            <h1 id="em-heading" ref={headingRef} tabIndex={-1} className={s.stepTitle}>
              {step.title}
            </h1>
            <p className={s.stepDetail}>{step.detail}</p>
            {step.zeroGNote && <p className={s.zeroG}>{step.zeroGNote}</p>}

            <button type="button" className={s.doneBtn} onClick={em.completeCurrentStep}>
              {index === steps.length - 1 ? 'Done, finish the checklist' : 'Done, next step'}
            </button>
            {step.escalations && step.escalations.length > 0 && (
              <div className={s.escalations}>
                <span className={t.eyebrow}>If you find</span>
                {step.escalations.map((x) => (
                  <button key={x.to} type="button" className={s.escalateBtn} onClick={() => em.escalateTo(x.to)}>
                    {x.label}
                  </button>
                ))}
              </div>
            )}
            <div className={s.row}>
              <button type="button" className={t.ghostBtn} onClick={em.skipCurrentStep}>
                Can’t do this
              </button>
              <button type="button" className={t.ghostBtn} onClick={em.goPreviousStep}>
                Back
              </button>
            </div>
            <p className={s.fine}>
              Medical Checklist {step.checklistRefId}. {EXAMPLE_CONTENT_NOTE}
            </p>
          </>
        )}
        {finished && (
          <>
            <span className={t.eyebrow}>Checklist finished</span>
            <h1 id="em-heading" ref={headingRef} tabIndex={-1} className={s.stepTitle}>
              Keep watching {firstName(patient.name)}
            </h1>
            <p className={s.stepDetail}>
              {completed} of {steps.length} steps done{skipped.length > 0 ? `, ${skipped.length} not done` : ''}. Recheck vitals when due and keep the flight surgeon updated.
            </p>
            {skipped.length > 0 && <p className={s.zeroG}>Not done: {skipped.map((x) => `step ${x.stepNumber}`).join(', ')}. Tap Back to try again.</p>}
            <button type="button" className={s.doneBtn} onClick={onGround}>
              {session.groundPacket ? 'Update the flight surgeon' : 'Message the flight surgeon'}
            </button>
            <div className={s.row}>
              <button type="button" className={t.ghostBtn} onClick={em.goPreviousStep}>
                Back
              </button>
            </div>
          </>
        )}
      </section>

      <div className={s.side}>
        <PatientCard patient={patient} formOpen={vitalsOpen} setFormOpen={setVitalsOpen} />

        <section className={s.card}>
          <span className={t.eyebrow}>Flight surgeon</span>
          {session.groundPacket ? (
            <p>
              Sent {formatTimeHHMM(session.groundPacket.sentAtIso)}, arrives {formatTimeHHMM(session.groundPacket.arrivesAtIso)}.{' '}
              <span className={t.muted}>Earliest reply {formatTimeHHMM(session.groundPacket.earliestReplyAtIso)}. Keep going.</span>
            </p>
          ) : (
            <p className={t.muted}>
              A message takes {formatMinutes(oneWayDelayMinutes)} min to reach Earth, so a reply takes at least {formatMinutes(oneWayDelayMinutes * 2)} min. Do not wait for it.
            </p>
          )}
          <div>
            <button type="button" className={t.why} onClick={onGround}>
              {session.groundPacket ? 'Open the message' : 'Prepare the message'}
            </button>
          </div>
        </section>

        <section className={s.card}>
          <span className={t.eyebrow}>Who does what · tap to change</span>
          {ROLES.map(({ key, label }) => (
            <RoleRow key={key} role={key} label={label} crew={crew} />
          ))}
        </section>

        <section className={s.card}>
          <button type="button" className={s.linkBtn} onClick={onLog}>
            Log so far ({session.logEntries.length})
          </button>
          <HoldToEndButton onConfirmEnd={em.endEmergency} />
        </section>
      </div>
    </div>
  );
}

/** Tapping cycles through everyone but the patient. */
function RoleRow({ role, label, crew }: { role: keyof EmergencyRoleAssignment; label: string; crew: CrewMemberSummary[] }) {
  const { session, updateRole } = useEmergency();
  const helpers = crew.filter((c) => c.id !== session!.patientId);
  const holder = crew.find((c) => c.id === session!.roles[role]);
  const next = () => {
    if (helpers.length === 0) return;
    const i = helpers.findIndex((c) => c.id === holder?.id);
    updateRole(role, helpers[(i + 1) % helpers.length]!.id);
  };
  return (
    <button type="button" className={s.roleRow} onClick={next} disabled={helpers.length === 0} aria-label={`${label}: ${holder?.name ?? 'nobody'}. Tap to change.`}>
      <span className={t.muted}>{label}</span>
      <strong>{holder ? firstName(holder.name) : helpers.length ? 'Tap to set' : 'Nobody else on board'}</strong>
    </button>
  );
}

const VITALS = ['hr', 'spo2', 'temp', 'glucose'];

/** The patient against their own usual (dossier D4: everything, Mind included). Newest measured vitals win over the check-in. */
function PatientCard({ patient, formOpen, setFormOpen }: { patient: CrewMemberSummary; formOpen: boolean; setFormOpen: (open: boolean) => void }) {
  const { session, vitalsCountdownSeconds } = useEmergency();
  const today = patient.today;
  const byId = (id: string) => today?.readings.find((r) => r.id === id || r.id === `bp_${id}`);
  const sys = byId('sys');
  const dia = byId('dia');
  const vitals = VITALS.map(byId).filter((r): r is Reading => !!r);
  const shown = new Set([...vitals, sys, dia].filter(Boolean));
  const otherFlagged = today?.readings.filter((r) => isFlagged(r.level) && !shown.has(r)) ?? [];
  const symptoms = byId('symptoms');
  const radiation = today?.readings.find((r) => r.zone === 'radiation' && r.note);
  const due = vitalsCountdownSeconds === 0;
  const hasData = today?.readings.some((r) => r.value !== null);

  // Newest value measured during the emergency for each vital, else the check-in one.
  const measured = session?.vitals ?? [];
  const latest = (key: 'hr' | 'sys' | 'dia' | 'spo2') => [...measured].reverse().find((v) => v[key] !== undefined);
  const now = (r: Reading | undefined, key: 'hr' | 'sys' | 'dia' | 'spo2') => {
    const m = latest(key);
    return m
      ? { text: String(m[key]), at: formatTimeHHMM(m.atIso), level: undefined, side: sideOf(m[key]!, r?.usual) }
      : r
        ? { text: formatValue(r), at: undefined, level: r.level, side: undefined }
        : undefined;
  };
  const last = measured.at(-1);

  return (
    <section className={s.card} aria-labelledby="em-patient">
      <div className={s.cardHead}>
        <span id="em-patient" className={t.eyebrow}>
          {firstName(patient.name)} now · against own usual
        </span>
        <span className={due ? s.due : t.muted}>{due ? 'Check due now' : `Next check in ${formatClock(vitalsCountdownSeconds)}`}</span>
      </div>
      {!last && (
        <p className={s.fineTight}>
          {today?.checkIn.doneAt ? `From the check-in at ${today.checkIn.doneAt}. Not measured since.` : 'Not measured since the emergency started.'}
        </p>
      )}

      {formOpen && <VitalsForm onClose={() => setFormOpen(false)} />}
      {!formOpen && (
        <div>
          <button type="button" className={due ? t.primaryBtn : t.ghostBtn} onClick={() => setFormOpen(true)}>
            Record vitals
          </button>
        </div>
      )}

      {!today && <p className={t.muted}>Loading readings…</p>}
      {today && !hasData && measured.length === 0 && <p className={t.muted}>No readings yet for {firstName(patient.name)}. Measure now.</p>}
      {today && (hasData || measured.length > 0) && (
        <ul className={s.vitals}>
          {(sys || latest('sys')) && (() => {
            const top = now(sys, 'sys');
            const bottom = now(dia, 'dia');
            return (
              <VitalRow
                label="Blood pressure"
                value={`${top?.text ?? '—'}/${bottom?.text ?? '—'}`}
                unit="mmHg"
                usual={sys?.usual && dia?.usual ? `${sys.usual[0]}–${sys.usual[1]} / ${dia.usual[0]}–${dia.usual[1]}` : undefined}
                level={top?.level ?? 'none'}
                at={top?.at}
                side={top?.side ?? bottom?.side}
              />
            );
          })()}
          {vitals.map((r) => {
            const key = r.id === 'hr' || r.id === 'spo2' ? r.id : undefined;
            const v = key ? now(r, key) : { text: formatValue(r), at: undefined, level: r.level, side: undefined };
            return (
              <VitalRow
                key={r.id}
                label={r.id === 'hr' ? 'Heart rate' : r.label}
                value={v?.text ?? '—'}
                unit={r.unit}
                usual={r.usual && `${r.usual[0].toFixed(r.decimals)}–${r.usual[1].toFixed(r.decimals)}`}
                level={v?.level ?? 'none'}
                at={v?.at}
                side={v?.side}
              />
            );
          })}
        </ul>
      )}
      {otherFlagged.length > 0 && (
        <div className={t.then}>
          <span>Also flagged</span>
          <ul>
            {otherFlagged.map((r) => (
              <li key={r.id} className={t[r.level]}>
                <StatusIcon level={r.level} /> {r.label} · {LEVEL_WORD[r.level]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {today && (
        <p className={s.fineTight}>
          {today.checkIn.doneAt ? `Checked in ${today.checkIn.doneAt}` : 'Not checked in today'}
          {symptoms?.note && symptoms.value ? ` · ${symptoms.note.replace(/\.$/, '')}` : ''}
          {radiation ? ` · Radiation: ${radiation.note}` : ''}
        </p>
      )}
    </section>
  );
}

/** Same plausible ranges as the check-in (typos, not clinical limits). Blank = not measured. */
const VITAL_FIELDS = [
  { key: 'hr', ...FIELDS.hr },
  { key: 'sys', ...FIELDS.sys },
  { key: 'dia', ...FIELDS.dia },
  { key: 'spo2', ...FIELDS.spo2 },
] as const;

function VitalsForm({ onClose }: { onClose: () => void }) {
  const { recordVitalsCheck } = useEmergency();
  const [text, setText] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.scrollIntoView({ block: 'center' });
    first.current?.focus({ preventScroll: true });
  }, []);

  const save = () => {
    const values: Omit<VitalsReading, 'atIso'> = {};
    for (const f of VITAL_FIELDS) {
      const v = parseNumber(text[f.key] ?? '');
      if (v === undefined) continue;
      if (Number.isNaN(v) || v < f.min || v > f.max) return setError(`${f.label} must be a number between ${f.min} and ${f.max} ${f.unit}.`);
      values[f.key] = v;
    }
    if ((values.sys === undefined) !== (values.dia === undefined)) return setError('Blood pressure needs both numbers.');
    recordVitalsCheck(values);
    onClose();
  };

  return (
    <form
      className={s.vitalsForm}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className={s.vitalsInputs}>
        {VITAL_FIELDS.map((f, i) => (
          <label key={f.key} className={s.vitalInput}>
            <span>{f.label}</span>
            <span className={s.inputWrap}>
              <input
                ref={i === 0 ? first : undefined}
                className={s.input}
                inputMode="decimal"
                autoComplete="off"
                value={text[f.key] ?? ''}
                onChange={(e) => {
                  setText({ ...text, [f.key]: e.target.value });
                  setError('');
                }}
              />
              <span className={t.muted}>{f.unit}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p className={s.formError} role="alert">
          {error}
        </p>
      )}
      <p className={s.fineTight}>Leave blank what you did not measure. Saving restarts the 5-minute countdown.</p>
      <div className={s.row}>
        <button type="submit" className={t.primaryBtn}>
          Save vitals
        </button>
        <button type="button" className={t.ghostBtn} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Where a value typed in during the emergency sits against the usual band. Not an engine judgment, just the range. */
const sideOf = (value: number, usual?: [number, number]) =>
  !usual ? undefined : value > usual[1] ? ('above' as const) : value < usual[0] ? ('below' as const) : undefined;

function VitalRow({ label, value, unit, usual, level, at, side }: {
  label: string; value: string; unit: string; usual?: string; level: Reading['level']; at?: string; side?: 'above' | 'below';
}) {
  // Values measured during the emergency carry their time, and "above/below usual" instead of an engine Watch/Alert.
  const flagged = isFlagged(level);
  return (
    <li className={`${s.vital} ${t[side ? 'alert' : level]} ${side ? s.vitalOut : ''}`}>
      <span>
        {label}
        <span className={s.usual}>
          {usual ? `usual ${usual}` : value === '—' ? 'no reading' : 'still learning'}
          {at && ` · measured ${at}`}
        </span>
      </span>
      <span className={s.vitalRight}>
        <span className={s.vitalValue}>
          {flagged && <StatusIcon level={level} />}
          <strong>{value}</strong> <span className={t.muted}>{value === '—' ? '' : unit}</span>
          {flagged && <span className={t.srOnly}>, {LEVEL_WORD[level]}</span>}
        </span>
        {side && <span className={s.outside}>{side} usual</span>}
      </span>
    </li>
  );
}

/* ── Message to the flight surgeon: what, now, done, and numbered questions. ── */
function Ground({ crew, headingRef, oneWayDelayMinutes, onBack }: { crew: CrewMemberSummary[]; headingRef: HeadingRef; oneWayDelayMinutes: number; onBack: () => void }) {
  const { session, sendGroundMessage, addGroundQuestion } = useEmergency();
  const [draft, setDraft] = useState('');
  const sess = session!;
  const patient = crew.find((c) => c.id === sess.patientId);
  const questions = sess.groundQuestions ?? sess.groundPacket?.questions ?? [];
  const packets = sess.groundPackets ?? (sess.groundPacket ? [sess.groundPacket] : []);
  const add = () => {
    if (!draft.trim()) return;
    addGroundQuestion(draft);
    setDraft('');
  };

  return (
    <div className={s.page}>
      <div>
        <button type="button" className={s.linkBtn} onClick={onBack}>
          ← Back to the steps
        </button>
      </div>
      <h1 id="em-heading" ref={headingRef} tabIndex={-1} className={s.title}>
        Message to the flight surgeon
      </h1>
      <p className={t.muted}>
        It reaches Earth in {formatMinutes(oneWayDelayMinutes)} min; a reply takes at least {formatMinutes(oneWayDelayMinutes * 2)} min. Keep following the steps while you wait.
      </p>

      <section className={s.card}>
        <dl className={s.packet}>
          <dt>What</dt>
          <dd>
            {CONDITION_LABELS[sess.condition]}, {patient?.name ?? 'patient'}, since {formatTimeHHMM(sess.startedAtIso)}
          </dd>
          <dt>Now</dt>
          <dd>{latestVitalsSummary(sess, patient)}</dd>
          <dt>Done</dt>
          <dd>{sess.completedStepIds.length > 0 ? doneTitles(sess).join(', ') : 'Nothing yet'}</dd>
        </dl>
      </section>

      <section className={s.card}>
        <span className={t.eyebrow}>Our questions</span>
        {questions.length > 0 ? (
          <ol className={s.questions}>
            {questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        ) : (
          <p className={t.muted}>No questions yet.</p>
        )}
        <form
          className={s.addRow}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label className={t.srOnly} htmlFor="em-question">
            Add a question
          </label>
          <input id="em-question" className={s.input} value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} placeholder="Add a question" />
          <button type="submit" className={t.ghostBtn}>
            Add
          </button>
        </form>
      </section>

      <div className={s.row}>
        <button type="button" className={s.doneBtn} onClick={() => sendGroundMessage(questions)}>
          {sess.groundPacket ? 'Send the update' : 'Send to the flight surgeon'}
        </button>
      </div>

      {packets.length > 0 && (
        <section className={s.card} aria-label="Sent messages">
          <span className={t.eyebrow}>Sent</span>
          <ol className={s.sent}>
            {packets.map((p, i) => (
              <li key={p.id}>
                <strong>
                  Message {i + 1} · sent {formatTimeHHMM(p.sentAtIso)}
                </strong>
                <span className={t.muted}>
                  Arrives {formatTimeHHMM(p.arrivesAtIso)} · earliest reply {formatTimeHHMM(p.earliestReplyAtIso)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function LogList() {
  const { session } = useEmergency();
  return (
    <ol className={s.log}>
      {session!.logEntries.map((entry, i) => (
        <li key={i}>
          <span className={t.mono}>+{formatClock(entry.elapsedSec)}</span>
          <span>{entry.event}</span>
        </li>
      ))}
    </ol>
  );
}

function Log({ headingRef, onBack }: { headingRef: HeadingRef; onBack: () => void }) {
  return (
    <div className={s.page}>
      <div>
        <button type="button" className={s.linkBtn} onClick={onBack}>
          ← Back to the steps
        </button>
      </div>
      <h1 id="em-heading" ref={headingRef} tabIndex={-1} className={s.title}>
        Log so far
      </h1>
      <p className={t.muted}>Written automatically as you go.</p>
      <section className={s.card}>
        <LogList />
      </section>
    </div>
  );
}

/* ── After "End emergency": what happened, then close. ── */
function Ended({ crew, headingRef }: { crew: CrewMemberSummary[]; headingRef: HeadingRef }) {
  const { session, elapsedSeconds, closeDrawer } = useEmergency();
  const patient = crew.find((c) => c.id === session!.patientId);
  return (
    <div className={s.page}>
      <h1 id="em-heading" ref={headingRef} tabIndex={-1} className={s.title}>
        What happened
      </h1>
      <p className={t.muted}>
        {patient?.name ?? 'Patient'} · {CONDITION_LABELS[session!.condition]} · {formatClock(elapsedSeconds)} long. Saved on this device.
      </p>
      <section className={s.card}>
        <LogList />
      </section>
      <div>
        <button type="button" className={t.primaryBtn} onClick={closeDrawer}>
          Close
        </button>
      </div>
    </div>
  );
}
