import { useRef, useState, type ReactNode } from 'react'
import { actionFor } from '../../data/guidance'
import type { Context, MetricId } from '../../data/types'
import { LEVEL_WORD } from '../today/model'
import { StatusIcon } from '../today/StatusIcon'
import t from '../today/today.module.css'
import s from './checkin.module.css'
import {
  CONTEXT_LABEL, DEMO_FORM, EMPTY_FORM, FIELDS, atypical, fromAnswers, outcomeHeadline, toAnswers,
  type CheckInAnswers, type ContextField, type FieldId, type FormState, type Outcome,
} from './model'

export interface CheckInScreenProps {
  /** Whose check-in this is (shown big: there is no sign-in, PRD D1). */
  name: string
  /** Mission day being logged. */
  day?: number
  /** Today's saved answers, if any: the form opens on them and saving updates them (PRD F-03 "Edit"). */
  existing?: CheckInAnswers
  /** Personal bands (median ± 1.5 × scale) from Today, to ask "are you sure?" on very unusual values. */
  usual?: Partial<Record<MetricId, [number, number]>>
  /** Saves and recomputes. Wire as `async (a) => toOutcomes(await saveCheckIn(crewId, a, takenAt, day))`. */
  onSave: (answers: CheckInAnswers) => Promise<Outcome[]>
  /** "Back to Today" after saving. */
  onDone?: () => void
  /** Result screen buttons; each one shows only when its handler is given. */
  onEmergency?: () => void
  onWhy?: (metricId: string) => void
  onNoteForEarth?: (metricId: string) => void
}

const MOODS = ['Very low', 'Low', 'Okay', 'Good', 'Great'] as const
const MOUTHS = ['M9 17q3-3 6 0', 'M9 16.5q3-1.5 6 0', 'M9 16h6', 'M9 15.5q3 1.8 6 0', 'M8.5 15q3.5 3.5 7 0'] // sad → happy

// Line-drawn faces: emoji look different on every device and clash with the line icons.
const Face = ({ i }: { i: number }) => (
  <svg className={s.face} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" />
    <path d="M9 9.5v1M15 9.5v1" />
    <path d={MOUTHS[i]} />
  </svg>
)
const SEVERITY = ['None', 'Mild', 'Moderate', 'Severe'] as const
const FLUID_STEP_ML = 250

export function CheckInScreen({ name, day, existing, usual = {}, onSave, onDone, onEmergency, onWhy, onNoteForEarth }: CheckInScreenProps) {
  const [form, setForm] = useState<FormState>(() => (existing ? fromAnswers(existing) : EMPTY_FORM))
  const [editing, setEditing] = useState(existing !== undefined)
  const [touched, setTouched] = useState<Set<FieldId>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [result, setResult] = useState<Outcome[] | null>(null)
  const busy = useRef(false) // a double click lands before React disables the button

  const { answers, errors } = toAnswers(form)
  const errorFor = (id: FieldId) => ((submitted || touched.has(id)) && errors[id]) || undefined
  const count = Object.keys(answers).length

  const update = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    setWarnings([]) // any edit means the numbers must be checked again
    setSaveError('')
  }
  const setText = (id: FieldId, v: string) => update({ text: { ...form.text, [id]: v } })
  const setContext = (id: ContextField, c: Context) => update({ context: { ...form.context, [id]: c } })

  const save = async () => {
    setSubmitted(true)
    const firstBad = (Object.keys(FIELDS) as FieldId[]).find((id) => errors[id])
    if (firstBad) document.getElementById(`ci-${firstBad}`)?.focus() // the error may be off-screen
    if (busy.current || firstBad || count === 0) return
    if (warnings.length === 0) {
      const odd = atypical(answers, usual)
      if (odd.length > 0) return setWarnings(odd) // second press = confirmed
    }
    busy.current = true
    setSaving(true)
    setSaveError('')
    try {
      setResult(await onSave(answers))
      setEditing(true)
      setWarnings([])
    } catch {
      setSaveError('Could not save. Your entries are still here, please try again.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const header = (
    <header className={t.banner}>
      <div>
        <span className={t.eyebrow}>Daily check-in{day !== undefined && ` · Day ${day}`}</span>
        <h1 className={t.name}>{name}</h1>
      </div>
      {result === null && (
        <button type="button" className={t.ghostBtn} onClick={() => update(DEMO_FORM)}>
          <span className={s.demoTag}>Demo</span> Fill typical values
        </button>
      )}
    </header>
  )

  if (result !== null) {
    return (
      <section className={`${t.root} ${s.page}`} aria-label={`Check-in result for ${name}`}>
        {header}
        <Result
          outcomes={result}
          first={name.split(' ')[0]}
          count={count}
          onDone={onDone}
          onEdit={() => setResult(null)}
          onEmergency={onEmergency}
          onWhy={onWhy}
          onNoteForEarth={onNoteForEarth}
        />
      </section>
    )
  }

  const num = (id: FieldId) => (
    <NumField id={id} value={form.text[id] ?? ''} error={errorFor(id)} usual={usual[id]} onChange={(v) => setText(id, v)} onBlur={() => setTouched((x) => new Set(x).add(id))} />
  )
  const ctx = (id: ContextField, what: string) => (
    <Pills label="Taken" ariaLabel={`${what} taken`} value={form.context[id]} onChange={(c) => c && setContext(id, c)} options={FIELDS[id].contexts.map((c) => [c, CONTEXT_LABEL[c]])} />
  )
  const fluidsL = form.fluidsMl === undefined ? null : (form.fluidsMl / 1000).toFixed(2).replace(/0$/, '')

  return (
    <section className={`${t.root} ${s.page}`} aria-label={`Check-in for ${name}`}>
      {header}
      <p className={s.intro}>
        {editing ? 'You already checked in today. Change anything below and save again.' : 'About a minute.'} Leave blank anything you did not
        measure: blank is never saved as 0.
      </p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Section title="Sleep and mood" tone="learn">
          {num('sleep')}
          <Pills
            label="Mood"
            toggle
            value={form.mood}
            onChange={(v) => update({ mood: v })}
            options={MOODS.map((m, i) => [i + 1, <><Face i={i} /> {m}</>])}
          />
        </Section>

        <Section title="Vitals" tone="ok">
          <div className={s.measure}>
            {num('hr')}
            {ctx('hr', 'Heart rate')}
          </div>
          {num('spo2')}
          <div className={s.measure}>
            {num('temp')}
            {ctx('temp', 'Temperature')}
          </div>
        </Section>

        <Section title="How you feel" tone="watch">
          <Pills label="Symptoms today (headache, nausea, congestion, pain, fever…)" toggle value={form.symptoms} onChange={(v) => update({ symptoms: v })} options={SEVERITY.map((x, i) => [i, x])} />
          <Pills label="Vision self-check: any blur or change?" toggle value={form.vision} onChange={(v) => update({ vision: v })} options={SEVERITY.map((x, i) => [i, x])} />
        </Section>

        <Section title="Body and activity" tone="learn">
          <div className={s.pair}>
            {num('weight')}
            {num('exercise')}
          </div>
          <div className={s.field}>
            <span className={s.label} id="ci-fluids">
              Fluids
            </span>
            <div className={s.stepper} role="group" aria-labelledby="ci-fluids">
              <button type="button" className={t.ghostBtn} aria-label={`Remove ${FLUID_STEP_ML} mL`} disabled={!form.fluidsMl}
                onClick={() => update({ fluidsMl: form.fluidsMl! > FLUID_STEP_ML ? form.fluidsMl! - FLUID_STEP_ML : undefined })}>
                −
              </button>
              <output className={s.stepValue} aria-live="polite">
                {fluidsL === null ? <span className={t.muted}>Not logged</span> : <>{fluidsL}<span className={s.unitText}> L</span></>}
              </output>
              <button type="button" className={t.ghostBtn} onClick={() => update({ fluidsMl: (form.fluidsMl ?? 0) + FLUID_STEP_ML })}>
                +{FLUID_STEP_ML} mL
              </button>
            </div>
          </div>
        </Section>

        <details className={`${t.card} ${s.optional}`} open={Boolean(form.text.glucose || form.text.sys || form.text.dia)}>
          <summary>
            <span className={s.sectionTitle}>
              Glucose and blood pressure <span className={s.optionalTag}>Optional</span>
            </span>
          </summary>
          <div className={s.optionalBody}>
            <div className={s.measure}>
              {num('glucose')}
              {ctx('glucose', 'Glucose')}
            </div>
            <div className={s.measure}>
              <div className={s.pair}>
                {num('sys')}
                {num('dia')}
              </div>
              {ctx('sys', 'Blood pressure')}
            </div>
          </div>
        </details>

        {warnings.length > 0 && (
          <div className={`${t.card} ${t.watch}`} role="alert">
            <p className={s.sectionTitle}>Please double-check</p>
            <ul className={s.changes}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className={t.muted}>Fix the number above if it is a typo, or press "Save anyway" if it is right.</p>
          </div>
        )}

        <div className={s.footer}>
          <p className={s.status} role={saveError || (submitted && count === 0) ? 'alert' : undefined}>
            {saveError ||
              (submitted && Object.keys(errors).length > 0 && 'Check the highlighted fields.') ||
              (submitted && count === 0 && 'Fill in at least one reading.') ||
              `${count} reading${count === 1 ? '' : 's'} ready`}
          </p>
          <button type="submit" className={t.primaryBtn} disabled={saving}>
            {saving ? 'Saving…' : warnings.length > 0 ? 'Save anyway' : `${editing ? 'Update' : 'Save'} check-in for ${name.split(' ')[0]}`}
          </button>
        </div>
      </form>
    </section>
  )
}

function Section({ title, tone, children }: { title: string; tone: 'ok' | 'watch' | 'learn'; children: ReactNode }) {
  return (
    <fieldset className={`${t.card} ${t[tone]} ${s.section}`}>
      <legend className={s.sectionTitle}>{title}</legend>
      {children}
    </fieldset>
  )
}

function NumField({ id, value, error, usual, onChange, onBlur }: {
  id: FieldId; value: string; error?: string; usual?: [number, number]; onChange: (v: string) => void; onBlur: () => void
}) {
  const { label, unit } = FIELDS[id]
  const hint = error ?? (usual && `Your usual ${usual[0]}–${usual[1]} ${unit}`)
  return (
    <div className={s.field}>
      <label htmlFor={`ci-${id}`} className={s.label}>
        {label} <span className={s.sr}>in {unit}</span>
      </label>
      <div className={`${s.inputWrap} ${error ? s.invalid : ''}`}>
        <input
          id={`ci-${id}`}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? `ci-${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        <span className={s.unitText} aria-hidden="true">
          {unit}
        </span>
      </div>
      {hint && (
        <p id={`ci-${id}-hint`} className={error ? s.fieldError : s.hint}>
          {hint}
        </p>
      )}
    </div>
  )
}

/** A row of pill buttons. `toggle` lets a second tap clear it (for optional answers like mood). */
function Pills<V extends string | number>({ label, ariaLabel, value, options, onChange, toggle }: {
  label: string; ariaLabel?: string; value: V | undefined; options: [V, ReactNode][]; onChange: (v: V | undefined) => void; toggle?: boolean
}) {
  return (
    <div className={s.field}>
      <span className={s.label}>{label}</span>
      <div className={s.pills} role="group" aria-label={ariaLabel ?? label}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" className={s.pill} aria-pressed={value === v} onClick={() => onChange(toggle && value === v ? undefined : v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

// The guidance texts still use the old blood-pressure ids.
const GUIDE_ID: Record<string, string> = { sys: 'bp_sys', dia: 'bp_dia' }

/** After saving: the most urgent change, what to do now and how to escalate (PRD F-03, 3-step ladder). */
function Result({ outcomes, first, count, onDone, onEdit, onEmergency, onWhy, onNoteForEarth }: {
  outcomes: Outcome[]; first: string; count: number; onDone?: () => void; onEdit: () => void
} & Pick<CheckInScreenProps, 'onEmergency' | 'onWhy' | 'onNoteForEarth'>) {
  const [top, ...rest] = outcomes
  const level = top?.level ?? 'ok'
  const flagged = level !== 'ok'
  const act = top && flagged ? actionFor(GUIDE_ID[top.metric] ?? top.metric, level) : undefined
  return (
    <>
      <article className={`${t.next} ${t[level]}`} role="status" aria-labelledby="ci-result">
        <div className={t.nextHead}>
          <p className={t.eyebrow}>Check-in saved · {first}</p>
          {top && (
            <span className={t.badge}>
              <StatusIcon level={level} /> {top.level === 'ok' ? 'Resolved' : LEVEL_WORD[level]}
            </span>
          )}
        </div>
        <h2 id="ci-result" className={t.nextTitle}>
          {top ? outcomeHeadline(top) : 'Nothing new to act on'}
        </h2>
        <p className={t.nextText}>
          {top && flagged && top.rule && top.rule !== outcomeHeadline(top) ? `${top.rule} ` : ''}
          {!top && `${count} reading${count === 1 ? '' : 's'} saved and compared with ${first}'s usual. Keep following your plan.`}
        </p>
        {act && (
          <p className={s.doNow}>
            <strong>Do this now:</strong> {act}
          </p>
        )}
        {top && flagged && (
          <div className={t.nextFoot}>
            {level === 'alert' && onEmergency && (
              <button type="button" className={s.danger} onClick={onEmergency}>
                Get help now
              </button>
            )}
            {onWhy && (
              <button type="button" className={t.why} onClick={() => onWhy(top.metric)}>
                Why am I seeing this?
              </button>
            )}
            {onNoteForEarth && (
              <button type="button" className={t.ghostBtn} onClick={() => onNoteForEarth(top.metric)}>
                Message flight surgeon
              </button>
            )}
          </div>
        )}
        {flagged && (
          <div className={s.ladder}>
            <span className={t.eyebrow}>If it does not settle</span>
            <ol>
              <li>Look after yourself (now)</li>
              <li>Tell the crew medic</li>
              <li>Message the flight surgeon</li>
            </ol>
          </div>
        )}
        {rest.length > 0 && (
          <div className={t.then}>
            <span>Also</span>
            <ul>
              {rest.map((o) => (
                <li key={o.metric} className={t[o.level]}>
                  <StatusIcon level={o.level} /> {outcomeHeadline(o)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className={t.fine}>Decision support, not a diagnosis. Follow mission procedures.</p>
      </article>
      <div className={s.actions}>
        {onDone && (
          <button type="button" className={t.primaryBtn} onClick={onDone}>
            Back to Today
          </button>
        )}
        <button type="button" className={t.ghostBtn} onClick={onEdit}>
          Edit check-in
        </button>
      </div>
    </>
  )
}
