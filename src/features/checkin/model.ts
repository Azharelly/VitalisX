// Check-in form logic (PRD F-03), pure: text in, answers or errors out. No React, no database.
import type { CheckInAnswers, CheckInMetricId, CheckInResult } from '../../data/checkin'
import type { Context, MetricId } from '../../data/types'

/** What saveCheckIn() takes: one entry per metric the person filled in. Blank metrics are left out. */
export type { CheckInAnswers }

/** Typed fields. min/max are physically plausible ranges to catch typos, NOT clinical limits (those live in the engine). */
export const FIELDS = {
  sleep: { label: 'Sleep', unit: 'h', min: 0, max: 24 },
  hr: { label: 'Heart rate', unit: 'bpm', min: 25, max: 250, contexts: ['resting', 'after_exercise'] },
  spo2: { label: 'SpO₂', unit: '%', min: 50, max: 100 },
  temp: { label: 'Temperature', unit: '°C', min: 30, max: 45, contexts: ['resting', 'after_exercise', 'after_meal'] },
  glucose: { label: 'Glucose', unit: 'mg/dL', min: 20, max: 600, contexts: ['fasting', 'after_meal', 'other'] },
  sys: { label: 'Systolic', unit: 'mmHg', min: 50, max: 260, contexts: ['resting', 'after_exercise'] },
  dia: { label: 'Diastolic', unit: 'mmHg', min: 30, max: 160 },
  weight: { label: 'Weight', unit: 'kg', min: 30, max: 250 },
  exercise: { label: 'Exercise', unit: 'min', min: 0, max: 600 },
} satisfies Partial<Record<MetricId, { label: string; unit: string; min: number; max: number; contexts?: Context[] }>>

export type FieldId = keyof typeof FIELDS
export type ContextField = 'hr' | 'temp' | 'glucose' | 'sys' // dia uses the sys (blood pressure) context

export const CONTEXT_LABEL: Record<Context, string> = {
  resting: 'Resting', after_exercise: 'After exercise', after_meal: 'After meal', fasting: 'Fasting', morning: 'Morning', other: 'Other',
}

/** "37,5" → 37.5; "" → undefined; anything that is not a plain number → NaN. */
export function parseNumber(text: string): number | undefined {
  const t = text.trim().replace(',', '.')
  if (t === '') return undefined
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN
}

export interface FormState {
  text: Partial<Record<FieldId, string>>
  context: Record<ContextField, Context>
  fluidsMl?: number // undefined = not logged (empty is not 0)
  mood?: number // 1–5
  symptoms?: number // 0–3 severity
  vision?: number // 0–3 severity
}

export const EMPTY_FORM: FormState = {
  text: {},
  context: { hr: 'resting', temp: 'resting', glucose: 'fasting', sys: 'resting' },
}

/** Turns the form into saveCheckIn() answers, plus a plain-language error per field that is wrong. */
export function toAnswers(f: FormState): { answers: CheckInAnswers; errors: Partial<Record<FieldId, string>> } {
  const answers: CheckInAnswers = {}
  const errors: Partial<Record<FieldId, string>> = {}
  for (const id of Object.keys(FIELDS) as FieldId[]) {
    const { label, unit, min, max } = FIELDS[id]
    const v = parseNumber(f.text[id] ?? '')
    if (v === undefined) continue
    if (Number.isNaN(v)) errors[id] = `${label}: use digits only, with a dot or a comma for decimals`
    else if (v < min || v > max) errors[id] = `${label} must be between ${min} and ${max} ${unit}`
    else answers[id] = { value: v, ...(id in f.context ? { context: f.context[id as ContextField] } : {}) }
  }
  if (answers.dia) answers.dia.context = f.context.sys
  const sysFilled = (f.text.sys ?? '').trim() !== ''
  const diaFilled = (f.text.dia ?? '').trim() !== ''
  if (sysFilled !== diaFilled) errors[sysFilled ? 'dia' : 'sys'] ??= 'Blood pressure needs both numbers'
  else if (answers.sys && answers.dia && answers.dia.value >= answers.sys.value) errors.dia = 'Diastolic must be lower than systolic'

  if (f.fluidsMl !== undefined) answers.fluids = { value: f.fluidsMl / 1000 } // the fluids metric is stored in litres
  if (f.mood !== undefined) answers.mood = { value: f.mood }
  if (f.symptoms !== undefined) answers.symptoms = { value: f.symptoms }
  if (f.vision !== undefined) answers.vision = { value: f.vision }
  return { answers, errors }
}

/** Back from saved answers to the form, for "Edit today's check-in". */
export function fromAnswers(a: CheckInAnswers): FormState {
  const text: FormState['text'] = {}
  for (const id of Object.keys(FIELDS) as FieldId[]) if (a[id]) text[id] = String(a[id]!.value)
  const context = { ...EMPTY_FORM.context }
  for (const id of Object.keys(context) as ContextField[]) if (a[id]?.context) context[id] = a[id]!.context!
  return {
    text, context,
    fluidsMl: a.fluids && Math.round(a.fluids.value * 1000),
    mood: a.mood?.value, symptoms: a.symptoms?.value, vision: a.vision?.value,
  }
}

/**
 * Plausible but very unusual for this person (|z| ≥ 3, the Alert line), so a typo can be caught before saving.
 * `usual` is the personal band median ± 1.5 × scale, so 3 × scale is twice its half-width from the middle.
 */
export function atypical(answers: CheckInAnswers, usual: Partial<Record<MetricId, [number, number]>>): string[] {
  const out: string[] = []
  for (const id of Object.keys(FIELDS) as FieldId[]) {
    const a = answers[id]
    const band = usual[id]
    if (!a || !band) continue
    const mid = (band[0] + band[1]) / 2
    const half = (band[1] - band[0]) / 2
    if (half > 0 && Math.abs(a.value - mid) > 2 * half) {
      out.push(`${FIELDS[id].label} ${a.value} ${FIELDS[id].unit} is far from your usual ${band[0]}–${band[1]}`)
    }
  }
  return out
}

/** Typical values for a quick demo. Shown only behind a button labelled "Demo" (PRD F-03). */
export const DEMO_FORM: FormState = {
  text: { sleep: '6.5', hr: '66', spo2: '98', temp: '36.7', exercise: '45' },
  context: EMPTY_FORM.context,
  fluidsMl: 2000, mood: 4, symptoms: 0, vision: 0,
}

// ---------- after saving: what changed, most urgent first ----------

/** One alert touched by saveCheckIn(), in the words the result screen needs. */
export interface Outcome {
  metric: CheckInMetricId
  label: string
  level: 'ok' | 'watch' | 'alert' // ok = an alert was resolved
  change: 'opened' | 'escalated' | 'resolved' | 'ongoing' // ongoing = still open, same level (recompute's 'updated')
  value: number | null
  median: number | null // null for rule-only metrics (symptoms, vision) or while learning
  rule: string | null // the engine's plain-language reason
}

export const METRIC_LABEL: Record<CheckInMetricId, string> = {
  ...Object.fromEntries(Object.entries(FIELDS).map(([id, f]) => [id, f.label])),
  sys: 'Blood pressure', dia: 'Blood pressure', mood: 'Mood', fluids: 'Fluids', symptoms: 'Symptoms', vision: 'Vision',
} as Record<CheckInMetricId, string>

/** "12 of 13 readings" and "Temperature was left empty." so the result says what was skipped. Blood pressure counts once in the note. */
export function savedSummary(a: CheckInAnswers): { saved: string; empty: string } {
  const total = Object.keys(METRIC_LABEL).length
  const n = Object.keys(a).length
  const empty = [...new Set((Object.keys(METRIC_LABEL) as CheckInMetricId[]).filter((id) => !a[id]).map((id) => METRIC_LABEL[id]))]
  if (empty.length === 0) return { saved: `${n} readings`, empty: '' }
  const list = empty.length === 1 ? empty[0] : `${empty.slice(0, -1).join(', ')} and ${empty[empty.length - 1]}`
  return { saved: `${n} of ${total} reading${total === 1 ? '' : 's'}`, empty: `${list} ${empty.length === 1 ? 'was' : 'were'} left empty.` }
}

/** PRD 5.2 metric priority (1 = most urgent): breaks ties between outcomes of the same level. */
const PRIORITY: Partial<Record<CheckInMetricId, number>> = { spo2: 1, glucose: 2, hr: 3, sys: 3, dia: 3, temp: 4, symptoms: 5, vision: 6 }
const RANK = { alert: 2, watch: 1, ok: 0 }

/**
 * Every alert the saved readings touched, most urgent first. Uses `results`, not `changed`: an alert that stays open
 * at the same level is not a change, but a person who just logged a fever must still see it (not "nothing new").
 */
export function toOutcomes(res: Pick<CheckInResult, 'results'>): Outcome[] {
  return res.results
    .filter(({ result: r }) => r.change !== 'unchanged' && (r.change === 'resolved' || r.alert !== null))
    .map(({ metric_id, result }): Outcome => ({
      metric: metric_id,
      label: METRIC_LABEL[metric_id],
      level: result.change === 'resolved' ? 'ok' : result.alert?.level ?? 'ok',
      change: result.change === 'updated' ? 'ongoing' : (result.change as Outcome['change']),
      value: result.eval.value,
      median: result.eval.baseline?.median ?? null,
      rule: result.eval.rule,
    }))
    .sort((a, b) => RANK[b.level] - RANK[a.level] || (PRIORITY[a.metric] ?? 8) - (PRIORITY[b.metric] ?? 8))
    .filter((o, i, all) => all.findIndex((x) => x.label === o.label) === i) // systolic + diastolic = one "Blood pressure" line
}

/** "Temperature is far above your usual", "Heart rate is back to normal for you", or the engine's rule. */
export function outcomeHeadline(o: Outcome): string {
  if (o.level === 'ok') return `${o.label} is back to normal for you`
  if (o.value !== null && o.median !== null && o.value !== o.median) {
    return `${o.label} is ${o.level === 'alert' ? 'far ' : ''}${o.value > o.median ? 'above' : 'below'} your usual`
  }
  return o.rule ?? `${o.label} needs a look`
}
