// The Today/Report data contract (TodayApi) implemented on top of the local database (Dexie/IndexedDB).
// It only READS: readings, doses and metric definitions go through evaluate() and evaluateRadiation(),
// so the screen shows exactly what the engine says. Saving a check-in is saveCheckIn() in src/data/checkin.ts.
//
// Differences from the in-browser simulation (simulate.ts), on purpose:
//  - Metric ids follow src/data/types.ts. The screen's GUIDANCE uses other names for three of them
//    (sys -> bp_sys, dia -> bp_dia, rad_projection -> rad); this file translates them (GUIDANCE_ID).
//  - Radiation is judged by evaluateRadiation(): a solar particle event in the dose log gives Watch, not Alert.
//  - Notes for symptoms/vision come from the engine's rule text, because the database has no free text.

import { db as defaultDb, type VitalisDB } from '../../data/db'
import type { CrewMember, Measurement, Metric, MissionConfig, RadiationDose } from '../../data/types'
import { baselineWindow, byTime, computeBaseline } from '../../engine/baseline'
import { evaluate } from '../../engine/evaluate'
import { careerDose, evaluateRadiation, type RadiationEval } from '../../engine/radiation'
import { initialsOf, type CrewCard } from '../crew/model.ts'
import type { CrewSummary, TodayApi } from './api.ts'
import {
  ZONES,
  average,
  isFlagged,
  worst,
  type Level,
  type NextAction,
  type Reading,
  type ReportEvent,
  type ReportMetric,
  type ReportView,
  type TodayView,
  type WeekDay,
  type ZoneId,
} from './model.ts'

/** Metric id in the database -> id the screen's GUIDANCE uses. */
const GUIDANCE_ID: Record<string, string> = { sys: 'bp_sys', dia: 'bp_dia', rad_projection: 'rad' }
const guidanceId = (metricId: string) => GUIDANCE_ID[metricId] ?? metricId

const MIN_BASELINE = 14
const RAD_METRIC = 'rad_projection'
const RANK: Record<Level, number> = { alert: 0, watch: 1, learn: 2, ok: 3, none: 4 }

export interface DexieTodayApiOptions {
  database?: VitalisDB
  /** mission_config.json (loadMissionConfig), or a function that loads it. */
  mission: MissionConfig | (() => Promise<MissionConfig>)
}

interface Entry { reading: Reading; z: number | null }

interface Ctx {
  crew: CrewMember
  mission: MissionConfig
  metrics: Metric[]
  byMetric: Map<string, Measurement[]>
  doses: RadiationDose[]
  daysWithCheckIn: Set<number>
  cache: Map<number, Entry[]>
}

const round = (v: number, d: number) => Number(v.toFixed(d))
const clockOf = (iso: string) => iso.slice(11, 16)

async function loadCtx(database: VitalisDB, mission: MissionConfig, crewId: string): Promise<Ctx> {
  const id = Number(crewId)
  const crew = Number.isInteger(id) ? await database.crew_member.get(id) : undefined
  if (!crew) throw new Error(`Unknown crew member: ${crewId}`)
  const [metrics, rows, doses] = await Promise.all([
    database.metric.toArray(),
    database.measurement.where('crew_id').equals(id).toArray(),
    database.radiation_dose_log.where('crew_id').equals(id).sortBy('mission_day'),
  ])
  const byMetric = new Map<string, Measurement[]>()
  for (const m of rows.sort(byTime)) byMetric.set(m.metric_id, [...(byMetric.get(m.metric_id) ?? []), m])
  return {
    crew, mission, metrics, byMetric, doses,
    daysWithCheckIn: new Set(rows.map((m) => m.mission_day)),
    cache: new Map(),
  }
}

const checkDay = (mission: MissionConfig, day: number) => {
  if (!Number.isInteger(day) || day < 1 || day > mission.arrival_day) throw new Error(`Mission day out of range: ${day}`)
}

// ── one metric ──────────────────────────────────────────────────────────────────────────────

function metricEntry(ctx: Ctx, metric: Metric, day: number): Entry {
  const rows = ctx.byMetric.get(metric.id) ?? []
  const ev = evaluate(metric, rows, { asOfDay: day })
  const upTo = rows.filter((m) => m.mission_day <= day && Number.isFinite(m.value))
  const last = upTo[upTo.length - 1]
  const base = {
    id: guidanceId(metric.id),
    label: metric.label,
    zone: metric.zone as ZoneId,
    unit: metric.unit,
    decimals: metric.decimals,
    priority: metric.priority,
    context: metric.default_context ?? undefined,
  }
  if (!last) return { reading: { ...base, value: null, level: 'none' }, z: null }

  const measured = `${last.mission_day === day ? 'Today' : `Day ${last.mission_day}`}, ${clockOf(last.taken_at)}`
  const reading: Reading = { ...base, value: ev.value, level: ev.state, measured, trend: upTo.slice(-7).map((m) => m.value) }

  // evaluate() skips the baseline when a hard limit fires (e.g. fever), but the screen still wants the usual band.
  const baseline =
    ev.baseline ?? (metric.direction === 'rule_only' ? null : computeBaseline(baselineWindow(upTo, metric, last).map((m) => m.value), metric.min_sd))
  if (baseline) {
    const { median, sd } = baseline
    reading.usual = [round(median - 1.5 * sd, metric.decimals), round(median + 1.5 * sd, metric.decimals)]
  }
  if (metric.id === 'exercise') {
    // evaluate() returns sessions in the last 7 days; the database stores minutes per day.
    const sessionsEnding = (end: number) =>
      new Set(upTo.filter((m) => m.mission_day > end - 7 && m.mission_day <= end && m.value > 0).map((m) => m.mission_day)).size
    reading.unit = 'sessions'
    reading.measured = 'Last 7 days · plan 6'
    reading.trend = Array.from({ length: 7 }, (_, i) => sessionsEnding(day - 6 + i))
  }
  if (metric.id === 'symptoms' || metric.id === 'vision') {
    reading.note = ev.rule ?? (metric.id === 'vision' ? 'No blur reported' : 'None reported')
  }
  return { reading, z: ev.z }
}

// ── radiation ───────────────────────────────────────────────────────────────────────────────

function radiationEval(ctx: Ctx, day: number): RadiationEval {
  return evaluateRadiation({
    doses: ctx.doses.filter((d) => d.mission_day <= day),
    priorDoseMsv: ctx.crew.prior_dose_msv,
    currentDay: day,
    arrivalDay: ctx.mission.arrival_day,
  })
}

function radiationEntry(ctx: Ctx, day: number): Entry {
  const metric = ctx.metrics.find((m) => m.id === RAD_METRIC)
  const r = radiationEval(ctx, day)
  const pct = (v: number) => Math.round((v / 600) * 100)
  const note = r.recentSep
    ? 'Solar particle event recorded in the last 24 hours'
    : `${pct(r.careerMsv)}% of the 600 mSv limit${r.projectionMsv === null ? '' : ` · ${Math.round(r.projectionMsv)} mSv (${pct(r.projectionMsv)}%) at arrival`}`
  const career = (d: number) => Math.round(careerDose(ctx.crew.prior_dose_msv, ctx.doses.filter((x) => x.mission_day <= d)))
  return {
    z: null,
    reading: {
      id: guidanceId(RAD_METRIC),
      label: metric?.label ?? 'Career dose',
      zone: 'radiation',
      unit: metric?.unit ?? 'mSv',
      decimals: metric?.decimals ?? 0,
      priority: metric?.priority ?? 7,
      value: r.state === 'none' ? null : Math.round(r.careerMsv),
      level: r.state,
      trend: Array.from({ length: 7 }, (_, i) => career(Math.max(1, day - 6 + i))),
      note,
      measured: `Dosimeter, day ${day}`,
    },
  }
}

// ── one day, all metrics ────────────────────────────────────────────────────────────────────

function entriesAt(ctx: Ctx, day: number): Entry[] {
  const hit = ctx.cache.get(day)
  if (hit) return hit
  const out = [
    ...ctx.metrics.filter((m) => m.id !== RAD_METRIC).map((m) => metricEntry(ctx, m, day)),
    radiationEntry(ctx, day),
  ]
  ctx.cache.set(day, out)
  return out
}
const readingsAt = (ctx: Ctx, day: number) => entriesAt(ctx, day).map((e) => e.reading)

const zoneLevels = (readings: Reading[]) =>
  Object.fromEntries(ZONES.map((z) => [z.id, worst(readings.filter((r) => r.zone === z.id).map((r) => r.level))])) as Record<ZoneId, Level>

/** Most urgent first: level, then metric priority, then how far from the person's normal (|z|). */
const urgency = (a: Entry, b: Entry) =>
  RANK[a.reading.level] - RANK[b.reading.level] ||
  a.reading.priority - b.reading.priority ||
  Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0)

const streakEnding = (ctx: Ctx, day: number) => {
  let n = 0
  for (let d = day; d >= 1 && ctx.daysWithCheckIn.has(d); d--) n++
  return n
}

const checkInClock = (ctx: Ctx, day: number): string | undefined => {
  const times = [...ctx.byMetric.values()].flat().filter((m) => m.mission_day === day).map((m) => m.taken_at)
  return times.length ? clockOf(times.sort()[times.length - 1]) : undefined
}

// ── views ───────────────────────────────────────────────────────────────────────────────────

function buildToday(ctx: Ctx, day: number): TodayView {
  const entries = entriesAt(ctx, day)
  const top = entries.filter((e) => isFlagged(e.reading.level)).sort(urgency)[0]
  const checkIns = [...ctx.daysWithCheckIn].filter((d) => d <= day).length
  const nextAction: NextAction = top
    ? { kind: 'metric', metricId: top.reading.id }
    : checkIns <= MIN_BASELINE
      ? { kind: 'learning', checkInsLeft: MIN_BASELINE + 1 - checkIns }
      : { kind: 'all-clear' }

  const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => day - 6 + i)
    .filter((d) => d >= 1)
    .map((d) => ({ day: d, zones: ctx.daysWithCheckIn.has(d) ? zoneLevels(readingsAt(ctx, d)) : null }))

  return {
    person: { id: String(ctx.crew.id), name: ctx.crew.name, role: ctx.crew.role, sex: ctx.crew.sex },
    missionDay: day,
    isSimulated: ctx.crew.is_simulated,
    checkIn: { doneAt: checkInClock(ctx, day), streakDays: streakEnding(ctx, day) },
    nextAction,
    readings: entries.map((e) => e.reading),
    week,
  }
}

function buildReport(ctx: Ctx, asOf: number, days: number): ReportView {
  const span = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
  const start = Math.max(1, asOf - days + 1)
  const period = span(start, asOf)
  const prev = span(Math.max(1, start - days), start - 1)
  const reading = (id: string, day: number) => readingsAt(ctx, day).find((r) => r.id === id)!
  const valueOn = (id: string, day: number) => (ctx.daysWithCheckIn.has(day) ? reading(id, day).value : null)

  const metrics: ReportMetric[] = readingsAt(ctx, asOf)
    .filter((r) => r.id !== guidanceId(RAD_METRIC))
    .map((r) => ({
      id: r.id, label: r.label, zone: r.zone, unit: r.unit, decimals: r.decimals, priority: r.priority,
      level: r.level, usual: r.usual,
      points: period.map((day) => ({ day, value: valueOn(r.id, day), level: reading(r.id, day).level })),
      avg: average(period.map((day) => valueOn(r.id, day))),
      prevAvg: prev.length ? average(prev.map((day) => valueOn(r.id, day))) : null,
    }))

  // Status changes that involve Watch or Alert, against the day before.
  const events: ReportEvent[] = []
  for (const day of period) {
    if (day < 2) continue
    for (const r of readingsAt(ctx, day)) {
      const before = reading(r.id, day - 1).level
      if (before !== r.level && (isFlagged(before) || isFlagged(r.level))) {
        events.push({ day, metricId: r.id, label: r.label, from: before, to: r.level })
      }
    }
  }

  const rad = radiationEval(ctx, asOf)
  const doseOn = new Map(ctx.doses.map((d) => [d.mission_day, d]))
  return {
    person: { id: String(ctx.crew.id), name: ctx.crew.name, role: ctx.crew.role },
    missionDay: asOf,
    days,
    isSimulated: ctx.crew.is_simulated,
    logged: period.filter((d) => ctx.daysWithCheckIn.has(d)).length,
    streakDays: streakEnding(ctx, asOf),
    metrics,
    zones: period.map((day) => ({ day, zones: ctx.daysWithCheckIn.has(day) ? zoneLevels(readingsAt(ctx, day)) : null })),
    radiation: {
      priorMsv: ctx.crew.prior_dose_msv,
      careerMsv: Math.round(rad.careerMsv),
      projectedMsv: rad.projectionMsv === null ? null : Math.round(rad.projectionMsv),
      limitMsv: 600,
      arrivalDay: ctx.mission.arrival_day,
      daily: period.map((day) => ({ day, msv: round(doseOn.get(day)?.dose_msv ?? 0, 2), storm: doseOn.get(day)?.sep_flag ?? false })),
    },
    events,
  }
}

// ── crew board card (used by dexieCrewApi) ──────────────────────────────────────────────────

/**
 * One card of the Crew board. Mind & sleep is private to the person (PRD F-01): it does not count towards the
 * ring, the zones or "needs attention" that the rest of the crew sees.
 */
export async function crewCardOf(database: VitalisDB, mission: MissionConfig, crewId: string, day: number): Promise<CrewCard> {
  const ctx = await loadCtx(database, mission, crewId)
  const shared = entriesAt(ctx, day).filter((e) => e.reading.zone !== 'mind')
  const zones = zoneLevels(shared.map((e) => e.reading))
  delete (zones as Partial<Record<ZoneId, Level>>).mind
  const lastDay = [...ctx.daysWithCheckIn].filter((d) => d <= day).sort((a, b) => b - a)[0] ?? null
  return {
    id: String(ctx.crew.id),
    name: ctx.crew.name,
    role: ctx.crew.role,
    initials: ctx.crew.initials || initialsOf(ctx.crew.name),
    sex: ctx.crew.sex,
    status: lastDay === null ? 'none' : worst(Object.values(zones)),
    zones,
    checkIn: { doneAt: ctx.daysWithCheckIn.has(day) ? checkInClock(ctx, day) : undefined, lastDay },
    attention: shared.filter((e) => isFlagged(e.reading.level)).sort(urgency).map((e) => e.reading),
  }
}

// ── the API ─────────────────────────────────────────────────────────────────────────────────

export function dexieTodayApi({ database = defaultDb, mission }: DexieTodayApiOptions): TodayApi {
  const getMission = async () => (typeof mission === 'function' ? mission() : mission)
  return {
    listCrew: async (): Promise<CrewSummary[]> =>
      (await database.crew_member.toArray())
        .filter((c) => c.removed_at === null || c.removed_at === undefined)
        .map((c) => ({ id: String(c.id), name: c.name, role: c.role })),

    getToday: async (crewId, day) => {
      const m = await getMission()
      const d = day ?? m.today_mission_day
      checkDay(m, d)
      return buildToday(await loadCtx(database, m, crewId), d)
    },

    getReport: async (crewId, { day, days = 7 } = {}) => {
      const m = await getMission()
      const d = day ?? m.today_mission_day
      checkDay(m, d)
      if (days !== 7 && days !== 28) throw new Error(`Report period must be 7 or 28 days, got ${days}`)
      return buildReport(await loadCtx(database, m, crewId), d, days)
    },
  }
}
