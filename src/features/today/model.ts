// View-model for the Today page: what the backend sends for one crew member on one mission day.
// The backend sends numbers and states only. All advice text comes from src/data/guidance.ts.
// shortcut: local types until src/data/types.ts lands; Level mirrors its State names, so the swap is an import change.

/** Status of a reading or zone. `learn` = not enough days yet to know this person's normal. */
export type Level = 'ok' | 'watch' | 'alert' | 'learn' | 'none'

/** Body zones. Radiation, Immune and Metabolism are whole-body (shown as auras / tiles). */
export type ZoneId = 'mind' | 'eyes' | 'heart' | 'bone' | 'immune' | 'meta' | 'radiation'

/** One metric's latest state for this person. `id` is the metric id used by GUIDANCE[id]. */
export interface Reading {
  id: string
  label: string
  zone: ZoneId
  value: number | null
  unit: string
  decimals: number
  level: Level
  priority: number // 1 = most urgent (metric.priority)
  usual?: [number, number] // personal normal band; absent while learning or for rule-only metrics
  trend?: number[] // recent readings, oldest first, last = value
  context?: string // resting, fasting, morning…
  measured?: string // already formatted with the mission clock
  note?: string // short data note (e.g. "Headache, chills", "49% of the 600 mSv limit")
}

/** What the page should lead with. The UI turns it into text with GUIDANCE. */
export type NextAction =
  | { kind: 'metric'; metricId: string }
  | { kind: 'learning'; checkInsLeft: number }
  | { kind: 'all-clear' }

/** One day of the "My week" grid: worst level per zone that day (null = no check-in). */
export interface WeekDay {
  day: number
  zones: Record<ZoneId, Level> | null
}

export interface TodayView {
  person: { id: string; name: string; role: string }
  missionDay: number
  isSimulated: boolean // drives the "Simulated data" label (PRD: is_simulated)
  checkIn: { doneAt?: string; streakDays: number } // doneAt absent = today's check-in is due
  nextAction: NextAction
  readings: Reading[]
  week: WeekDay[] // last 7 mission days, oldest first, last = today
}

export const ZONES: { id: ZoneId; label: string }[] = [
  { id: 'mind', label: 'Mind & sleep' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'heart', label: 'Heart' },
  { id: 'bone', label: 'Bones & muscle' },
  { id: 'immune', label: 'Immune' },
  { id: 'meta', label: 'Metabolism' },
  { id: 'radiation', label: 'Radiation' },
]

export const LEVEL_WORD: Record<Level, string> = {
  alert: 'Alert',
  watch: 'Watch',
  learn: 'Learning',
  ok: 'Normal',
  none: 'No data',
}

const RANK: Record<Level, number> = { alert: 0, watch: 1, learn: 2, ok: 3, none: 4 }

export const worst = (levels: Level[]): Level =>
  levels.reduce<Level>((w, l) => (RANK[l] < RANK[w] ? l : w), 'none')

export const isFlagged = (l: Level) => l === 'alert' || l === 'watch'

export const byAttention = (a: Reading, b: Reading) =>
  RANK[a.level] - RANK[b.level] || a.priority - b.priority

export const formatValue = (r: Reading) => (r.value === null ? '—' : r.value.toFixed(r.decimals))

// "+0.9 °C above your usual" style text; null when inside the band or nothing to compare.
export function deviation(r: Reading): string | null {
  if (r.value === null || !r.usual) return null
  const [lo, hi] = r.usual
  if (r.value > hi) return `${(r.value - hi).toFixed(r.decimals)} ${r.unit} above your usual`
  if (r.value < lo) return `${(lo - r.value).toFixed(r.decimals)} ${r.unit} below your usual`
  return null
}

/** Plain-language headline for a flagged reading, e.g. "Temperature is far above your usual". */
export function headline(r: Reading): string {
  if (r.value !== null && r.usual) {
    const dir = r.value > r.usual[1] ? 'above' : r.value < r.usual[0] ? 'below' : null
    if (dir) return `${r.label} is ${r.level === 'alert' ? 'far ' : ''}${dir} your usual`
  }
  return r.note ? `${r.label}: ${r.note}` : `${r.label} needs a look`
}

/** "Usual 36.7–37.1" for the personal band, or the learning message. */
export function usualText(r: Reading) {
  if (r.level === 'learn') return 'Learning your normal'
  if (!r.usual) return ''
  const [lo, hi] = r.usual
  return `Usual ${lo.toFixed(r.decimals)}–${hi.toFixed(r.decimals)}`
}

/* ── Report (week / month in review) ─────────────────────────────────────────── */

/** One day of one metric. `value` is null when there was no reading that day. */
export interface DayPoint {
  day: number
  value: number | null
  level: Level
}

/** One metric over the report period, plus the same-length period before it for comparison. */
export interface ReportMetric {
  id: string // GUIDANCE id
  label: string
  zone: ZoneId
  unit: string
  decimals: number
  priority: number
  level: Level // on the last day
  usual?: [number, number] // personal band on the last day
  points: DayPoint[] // one per day, oldest first
  avg: number | null
  prevAvg: number | null
}

/** A status change inside the period, e.g. Temperature ok → alert on day 141. */
export interface ReportEvent {
  day: number
  metricId: string
  label: string
  from: Level
  to: Level
}

export interface ReportView {
  person: { id: string; name: string; role: string }
  missionDay: number // last day of the period
  days: number // period length (7 = week, 28 = month)
  isSimulated: boolean
  logged: number // days with a check-in in the period
  streakDays: number
  metrics: ReportMetric[] // radiation is reported separately below
  zones: WeekDay[] // status ribbon, one entry per day
  radiation: {
    priorMsv: number // earlier missions
    careerMsv: number // total so far
    projectedMsv: number | null // at arrival; null once arrived
    limitMsv: number
    arrivalDay: number
    daily: { day: number; msv: number; storm: boolean }[] // one per day in the period
  }
  events: ReportEvent[] // oldest first
}

/** Mean of the non-null values, or null when there are none. */
export function average(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** "Up 0.4 h vs previous week" / "Steady" / null when there is nothing to compare. */
export function changeText(m: ReportMetric, period: string): string | null {
  if (m.avg === null || m.prevAvg === null) return null
  const d = m.avg - m.prevAvg
  if (Math.abs(d) < 10 ** -m.decimals) return `Steady vs previous ${period}` // under one display step
  return `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d).toFixed(Math.max(1, m.decimals))} ${m.unit} vs previous ${period}`
}
