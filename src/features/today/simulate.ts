import type { CrewSummary, TodayApi } from './api.ts'
import { byAttention, isFlagged, type Level, type Reading, type TodayView, type ZoneId } from './model.ts'

// Simulated backend for the Today screen. Everything here is made up (is_simulated = true), calibrated to the
// dossier's stories and orders of magnitude, and evaluated with the PRD §5 rules.
// shortcut: own mini-evaluator and mission constants; replace with src/engine + mission_config.json once they land.

export const MISSION = { currentDay: 142, arrivalDay: 210, careerLimitMsv: 600 }
const STORM_DAYS = [38, 77, 115, 150, 181] // simulated solar particle events
const BASELINE_DAYS = 28
const MIN_BASELINE = 14
const MISS_RATE = 0.08

interface Crew extends CrewSummary {
  priorDoseMsv: number
  doseRate: number // mSv/day in transit (MSL RAD ≈ 1.8)
  shift: Partial<Record<string, number>> // personal offsets from the population mean
}

const CREW: Crew[] = [
  { id: 'amara', name: 'Amara Okafor', role: 'Commander', priorDoseMsv: 25, doseRate: 1.84, shift: { hr: -4, sleep: 0.1, bp_sys: -3 } },
  { id: 'kenji', name: 'Kenji Tanaka', role: 'Flight engineer', priorDoseMsv: 130, doseRate: 1.88, shift: { hr: 2, weight: 6, sleep: -0.1 } },
  { id: 'lucia', name: 'Lucía Fernández', role: 'Mission specialist', priorDoseMsv: 10, doseRate: 1.82, shift: { hr: -2, weight: -9 } },
  { id: 'ravi', name: 'Ravi Menon', role: 'Systems engineer', priorDoseMsv: 35, doseRate: 1.85, shift: {} },
]

type Bad = 'high' | 'low' | 'both'
interface Def {
  id: string
  label: string
  zone: ZoneId
  unit: string
  decimals: number
  priority: number
  mean: number
  sd: number
  minSd: number
  bad: Bad
  absLow?: number
  absHigh?: number
  context?: string
  min?: number
  max?: number
}

// Baseline (robust z) metrics.
const Z_METRICS: Def[] = [
  { id: 'spo2', label: 'SpO₂', zone: 'heart', unit: '%', decimals: 0, priority: 1, mean: 97.6, sd: 0.6, minSd: 1, bad: 'low', absLow: 92, context: 'resting', max: 100 },
  { id: 'glucose', label: 'Glucose', zone: 'meta', unit: 'mg/dL', decimals: 0, priority: 2, mean: 93, sd: 4, minSd: 4, bad: 'both', absLow: 70, absHigh: 180, context: 'fasting' },
  { id: 'hr', label: 'Resting heart rate', zone: 'heart', unit: 'bpm', decimals: 0, priority: 3, mean: 66, sd: 1.6, minSd: 2.5, bad: 'both', context: 'resting' },
  { id: 'bp_sys', label: 'Systolic BP', zone: 'heart', unit: 'mmHg', decimals: 0, priority: 3, mean: 113, sd: 3, minSd: 3, bad: 'both', context: 'resting' },
  { id: 'bp_dia', label: 'Diastolic BP', zone: 'heart', unit: 'mmHg', decimals: 0, priority: 3, mean: 71, sd: 2, minSd: 2.5, bad: 'both', context: 'resting' },
  { id: 'temp', label: 'Temperature', zone: 'immune', unit: '°C', decimals: 1, priority: 4, mean: 36.95, sd: 0.1, minSd: 0.12, bad: 'high', absHigh: 37.9, context: 'resting' },
  { id: 'sleep', label: 'Sleep', zone: 'mind', unit: 'h', decimals: 1, priority: 8, mean: 6.5, sd: 0.25, minSd: 0.25, bad: 'low', min: 0, max: 12 },
  { id: 'mood', label: 'Mood', zone: 'mind', unit: '/5', decimals: 0, priority: 8, mean: 3.6, sd: 0.4, minSd: 0.7, bad: 'low', min: 1, max: 5 },
  { id: 'weight', label: 'Weight', zone: 'bone', unit: 'kg', decimals: 1, priority: 8, mean: 71.5, sd: 0.2, minSd: 0.3, bad: 'both', context: 'morning' },
  { id: 'fluids', label: 'Fluids', zone: 'meta', unit: 'L', decimals: 1, priority: 8, mean: 2.3, sd: 0.12, minSd: 0.15, bad: 'low', min: 0 },
]

const range = (from: number, to: number, v: number) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, v]))

// Story events per crew → metric → mission day → offset (severity for symptom-style metrics).
const EVENTS: Record<string, Record<string, Record<number, number>>> = {
  ravi: {
    temp: { 140: 0.15, 141: 0.55, 142: 1.25, 143: 0.8, 144: 0.35 },
    hr: { 140: 2.5, 141: 3, 142: 3, 143: 2.5, 144: 1 },
    fluids: { 142: -0.2 },
    symptoms: { 141: 1, 142: 2, 143: 2, 144: 1 },
  },
  amara: { sleep: range(136, 146, -0.85), mood: range(139, 146, -0.7), vision: { 95: 1 } },
  kenji: { exercise: range(120, 127, -1) },
  lucia: { symptoms: { 88: 1 } },
}
const NOTES: Record<string, string> = { ravi: 'Headache, chills', lucia: 'Skin irritation', amara: 'Blurred vision' }

// Example guidance (not clinically validated; the UI states decision support).
const ACTIONS: Record<string, Partial<Record<Level, string>> & { next?: string }> = {
  temp: { watch: 'Re-measure tonight and log any symptoms.', alert: 'Rest, drink fluids and re-measure in 1 hour.', next: 'Re-measure your temperature in 1 hour and send a report to the flight surgeon.' },
  hr: { watch: 'Sit for 5 minutes and re-measure your resting pulse.', alert: 'Re-measure now; if it stays high, report to the flight surgeon.' },
  spo2: { watch: 'Re-measure at rest in 10 minutes.', alert: 'Re-measure now and alert the crew medical officer.' },
  bp_sys: { watch: 'Re-measure seated after 5 minutes of rest.', alert: 'Re-measure now; report it if it stays out of range.' },
  bp_dia: { watch: 'Re-measure seated after 5 minutes of rest.', alert: 'Re-measure now; report it if it stays out of range.' },
  glucose: { watch: 'Re-measure fasting tomorrow morning.', alert: 'Re-measure now and follow the glucose procedure.' },
  sleep: { watch: "Protect tonight's sleep window: dim lights and no screens 1 hour before.", alert: 'Tell the commander and take a rest period today.' },
  mood: { watch: 'Take a break and talk to someone you trust; a private conference is available.', alert: 'Talk to the crew medical officer today.' },
  weight: { watch: 'Check food intake against your plan this week.', alert: 'Review your diet with the flight surgeon.' },
  fluids: { watch: 'Drink an extra 500 mL today.', alert: 'Drink now and re-check fluids tonight.' },
  vision: { watch: 'Repeat the vision self-test tomorrow and note any blur.', alert: 'Report vision changes to the flight surgeon today.' },
  symptoms: { watch: 'Log any change in the next check-in.', alert: 'Report symptoms to the crew medical officer now.' },
  exercise: { watch: 'Book your missed sessions this week; bone loss speeds up without them.' },
  rad: { watch: 'Limit time outside the shielded core and review EVA plans.', alert: 'Move to the storm shelter now and stay until the event ends.' },
}

// ── deterministic randomness ──
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
function rng(seed: string) {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r())
const round = (v: number, d: number) => Number(v.toFixed(d))
const clamp = (v: number, lo = -Infinity, hi = Infinity) => Math.min(hi, Math.max(lo, v))
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const eventOn = (c: Crew, day: number) => Object.values(EVENTS[c.id] ?? {}).some((m) => day in m)

/** A check-in is missed about 8% of days, never on a story day. Shared by all metrics of that person. */
function missed(c: Crew, day: number) {
  return !eventOn(c, day) && rng(`${c.id}:miss:${day}`)() < MISS_RATE
}

function checkInTime(c: Crew, day: number) {
  const mins = 6 * 60 + 50 + Math.floor(rng(`${c.id}:time:${day}`)() * 60)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

const cache = new Map<string, (number | null)[]>()

/** Daily series for one metric, days 1..arrival (index = mission day), with AR(1) day-to-day memory. */
function series(c: Crew, d: Def): (number | null)[] {
  const key = `${c.id}:${d.id}`
  const hit = cache.get(key)
  if (hit) return hit
  const r = rng(key)
  const out: (number | null)[] = [null]
  let x = 0
  for (let day = 1; day <= MISSION.arrivalDay; day++) {
    x = 0.6 * x + 0.8 * gauss(r)
    const v = d.mean + (c.shift[d.id] ?? 0) + x * d.sd + (EVENTS[c.id]?.[d.id]?.[day] ?? 0)
    out.push(missed(c, day) ? null : round(clamp(v, d.min, d.max), d.decimals))
  }
  cache.set(key, out)
  return out
}

const pointsUpTo = (s: (number | null)[], day: number) =>
  s.slice(1, day + 1).flatMap((v, i) => (v === null ? [] : [{ day: i + 1, v }]))

function measuredText(c: Crew, day: number, asOf: number) {
  return `${day === asOf ? 'Today' : `Day ${day}`}, ${checkInTime(c, day)}`
}

function reading(d: Pick<Def, 'id' | 'label' | 'zone' | 'unit' | 'decimals' | 'priority' | 'context'>, extra: Partial<Reading> & { level: Level }): Reading {
  const r: Reading = { id: d.id, label: d.label, zone: d.zone, unit: d.unit, decimals: d.decimals, priority: d.priority, context: d.context, value: null, ...extra }
  if (isFlagged(r.level)) r.action = ACTIONS[d.id]?.[r.level]
  return r
}

/** PRD §5.1–5.2: robust z against the person's last 28 days, same context; Alert on abs limits or |z| ≥ 3; Watch on 3 readings |z| ≥ 1.5. */
function evalZ(c: Crew, d: Def, asOf: number): Reading {
  const pts = pointsUpTo(series(c, d), asOf)
  if (!pts.length) return reading(d, { level: 'none' })
  const last = pts[pts.length - 1]
  const base = pts.filter((p) => p.day < last.day && p.day >= last.day - BASELINE_DAYS).map((p) => p.v)
  const common = { value: last.v, trend: pts.slice(-7).map((p) => p.v), measured: measuredText(c, last.day, asOf) }
  const absBreach = (d.absLow !== undefined && last.v < d.absLow) || (d.absHigh !== undefined && last.v > d.absHigh)
  if (base.length < MIN_BASELINE) return reading(d, { ...common, level: absBreach ? 'alert' : 'learn' })

  const med = median(base)
  const scale = Math.max(1.4826 * median(base.map((v) => Math.abs(v - med))), d.minSd) // floor stops MAD = 0 → infinite z
  const badZ = (v: number) => {
    const z = clamp((v - med) / scale, -10, 10)
    return d.bad === 'high' ? z : d.bad === 'low' ? -z : Math.abs(z)
  }
  const last3 = pts.slice(-3)
  const consecutive = last3.length === 3 && last3.every((p, i) => i === 0 || p.day - last3[i - 1].day <= 3)
  const level: Level =
    absBreach || badZ(last.v) >= 3 ? 'alert' : consecutive && last3.every((p) => badZ(p.v) >= 1.5) ? 'watch' : 'ok'
  return reading(d, { ...common, level, usual: [round(med - 1.5 * scale, d.decimals), round(med + 1.5 * scale, d.decimals)] })
}

/** Severity 0–3 metrics (symptoms, vision): 0 ok, 1–2 watch, 3 alert. Rule-only, no personal band. */
function evalSeverity(c: Crew, id: 'symptoms' | 'vision', asOf: number): Reading {
  const def = { id, label: id === 'symptoms' ? 'Symptoms' : 'Vision self-check', zone: (id === 'symptoms' ? 'immune' : 'eyes') as ZoneId, unit: '/3', decimals: 0, priority: id === 'symptoms' ? 5 : 6 }
  const ev = EVENTS[c.id]?.[id] ?? {}
  const pts = Array.from({ length: asOf }, (_, i) => i + 1)
    .filter((day) => !missed(c, day))
    .map((day) => ({ day, v: clamp(ev[day] ?? 0, 0, 3) }))
  if (!pts.length) return reading(def, { level: 'none' })
  const last = pts[pts.length - 1]
  const level: Level = last.v >= 3 ? 'alert' : last.v >= 1 ? 'watch' : 'ok'
  const note = last.v > 0 ? (id === 'vision' ? 'Blurred vision' : NOTES[c.id] ?? 'Reported') : id === 'vision' ? 'No blur reported' : 'None reported'
  return reading(def, { level, value: last.v, trend: pts.slice(-7).map((p) => p.v), note, measured: measuredText(c, last.day, asOf) })
}

/** Exercise: sessions in the last 7 days against a plan of 6; fewer than 4 → Watch. */
function evalExercise(c: Crew, asOf: number): Reading {
  const def = { id: 'exercise', label: 'Exercise', zone: 'bone' as ZoneId, unit: 'sessions / 7 days', decimals: 0, priority: 8 }
  const done = (day: number) => !missed(c, day) && rng(`${c.id}:ex:${day}`)() < (EVENTS[c.id]?.exercise?.[day] ? 0.15 : 0.85)
  const week = (end: number) => Array.from({ length: 7 }, (_, i) => end - i).filter((d) => d >= 1 && done(d)).length
  if (asOf < 7) return reading(def, { level: 'learn', value: week(asOf), measured: 'Plan: 6 per week' })
  const v = week(asOf)
  return reading(def, { level: v < 4 ? 'watch' : 'ok', value: v, trend: Array.from({ length: 7 }, (_, i) => week(asOf - 6 + i)), measured: 'Plan: 6 per week' })
}

/** PRD §5.3: career dose vs 600 mSv, projection at arrival, solar storm. Watch at ≥ 80% projected (PRD: OPEN, proposed). */
function evalRadiation(c: Crew, asOf: number): Reading {
  const def = { id: 'rad', label: 'Career dose', zone: 'radiation' as ZoneId, unit: 'mSv', decimals: 0, priority: 7 }
  const daily = (day: number) => c.doseRate + (rng(`${c.id}:dose:${day}`)() - 0.5) * 0.2 + (STORM_DAYS.includes(day) ? 2.6 : 0)
  const career = (day: number) => c.priorDoseMsv + Array.from({ length: day }, (_, i) => daily(i + 1)).reduce((a, b) => a + b, 0)
  const now = career(asOf)
  const rate = Array.from({ length: Math.min(7, asOf) }, (_, i) => daily(asOf - i)).reduce((a, b) => a + b, 0) / Math.min(7, asOf)
  const projected = asOf < MISSION.arrivalDay ? now + rate * (MISSION.arrivalDay - asOf) : null
  const pct = (v: number) => Math.round((v / MISSION.careerLimitMsv) * 100)
  const storm = STORM_DAYS.includes(asOf)
  const level: Level =
    storm || now >= MISSION.careerLimitMsv || (projected ?? 0) >= MISSION.careerLimitMsv ? 'alert' : (projected ?? now) >= 0.8 * MISSION.careerLimitMsv ? 'watch' : 'ok'
  const note = storm
    ? 'Solar particle event in progress'
    : `${pct(now)}% of the 600 mSv limit${projected === null ? '' : ` · ${Math.round(projected)} mSv (${pct(projected)}%) at arrival`}`
  return reading(def, {
    level,
    value: Math.round(now),
    trend: Array.from({ length: 7 }, (_, i) => Math.round(career(Math.max(1, asOf - 6 + i)))),
    note,
    measured: `Dosimeter, day ${asOf}`,
  })
}

function buildToday(c: Crew, asOf: number): TodayView {
  const readings = [
    ...Z_METRICS.map((d) => evalZ(c, d, asOf)),
    evalSeverity(c, 'symptoms', asOf),
    evalSeverity(c, 'vision', asOf),
    evalExercise(c, asOf),
    evalRadiation(c, asOf),
  ]
  const top = [...readings].sort(byAttention)[0]
  const checkIns = pointsUpTo(series(c, Z_METRICS[0]), asOf).length
  const learning = checkIns <= MIN_BASELINE
  const nextAction =
    top && isFlagged(top.level)
      ? { text: (top.level === 'alert' && ACTIONS[top.id]?.next) || top.action || 'Follow your plan.', metricId: top.id }
      : learning
        ? { text: `Learning your normal: ${MIN_BASELINE + 1 - checkIns} more check-ins needed. Keep doing your daily check-in.` }
        : { text: 'All normal. Follow your plan.' }
  return { person: { name: c.name, role: c.role }, missionDay: asOf, isSimulated: true, nextAction, readings }
}

/** In-browser implementation of the TodayApi contract, returning simulated data. Async like a real backend. */
export const simulatedTodayApi: TodayApi = {
  listCrew: async () => CREW.map(({ id, name, role }) => ({ id, name, role })),
  getToday: async (crewId, day = MISSION.currentDay) => {
    const c = CREW.find((x) => x.id === crewId)
    if (!c) throw new Error(`Unknown crew member: ${crewId}`)
    if (!Number.isInteger(day) || day < 1 || day > MISSION.arrivalDay) throw new Error(`Mission day out of range: ${day}`)
    return buildToday(c, day)
  },
}
