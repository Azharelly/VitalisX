// Check-in form logic (PRD F-03), pure: text in, answers or errors out. No React, no database.
import type { CheckInAnswers } from '../../data/checkin'
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
    if (Number.isNaN(v)) errors[id] = `${label}: type a number, like 36.6 or 36,6`
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
