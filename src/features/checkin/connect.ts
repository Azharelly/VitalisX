// Check-in on the real database: load what the form needs, save through saveCheckIn().
// No React here, so it can be tested against a seeded database (connect.test.ts).
import { saveCheckIn, type CheckInAnswers, type CheckInMetricId } from '../../data/checkin'
import { db as defaultDb, type VitalisDB } from '../../data/db'
import type { TodayApi } from '../today/api.ts'
import { toOutcomes, type Outcome } from './model'

export interface CheckInData {
  name: string
  /** The mission day being logged (resolved: "today" becomes a number). */
  day: number
  /** Today's saved check-in, if any: the form opens on it (Edit). */
  existing?: CheckInAnswers
  /** Time stamp every save of this check-in uses. Reusing it is what makes a second save an edit (PRD F-03). */
  takenAt: string
  /** Personal bands, keyed by the database metric ids. */
  usual: Partial<Record<CheckInMetricId, [number, number]>>
}

// Today's readings still use the screen's old ids for these.
const FROM_TODAY_ID: Record<string, CheckInMetricId> = { bp_sys: 'sys', bp_dia: 'dia' }
const CHECKIN_IDS = new Set<string>(['sleep', 'mood', 'vision', 'hr', 'sys', 'dia', 'spo2', 'exercise', 'weight', 'temp', 'symptoms', 'glucose', 'fluids'])

/** ISO time for a new check-in: the mission calendar date of `day` (day 1 = launch) at the current time of day. */
export function newTakenAt(day: number, launchDate?: string, now = new Date()): string {
  if (!launchDate) return now.toISOString()
  const d = new Date(`${launchDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + day - 1)
  return `${d.toISOString().slice(0, 10)}${now.toISOString().slice(10)}`
}

export async function loadCheckIn(
  todayApi: TodayApi, crewId: string, day?: number, opts: { launchDate?: string; database?: VitalisDB } = {},
): Promise<CheckInData> {
  const id = Number(crewId)
  if (!Number.isInteger(id)) throw new Error(`Check-in needs a database crew id, got "${crewId}"`)
  const view = await todayApi.getToday(crewId, day)
  const rows = await (opts.database ?? defaultDb).measurement.where('crew_id').equals(id)
    .filter((m) => m.mission_day === view.missionDay && m.source === 'checkin').toArray()

  // Several saves on one day with different times: the latest one is "today's check-in".
  const takenAt = rows.reduce<string | undefined>((t, m) => (t === undefined || m.taken_at > t ? m.taken_at : t), undefined)
  const todays = rows.filter((m) => m.taken_at === takenAt)
  const usual: CheckInData['usual'] = {}
  for (const r of view.readings) {
    const metric = FROM_TODAY_ID[r.id] ?? r.id
    if (r.usual && CHECKIN_IDS.has(metric)) usual[metric as CheckInMetricId] = r.usual
  }
  return {
    name: view.person.name,
    day: view.missionDay,
    existing: todays.length ? Object.fromEntries(todays.map((m) => [m.metric_id, { value: m.value, context: m.context }])) : undefined,
    takenAt: takenAt ?? newTakenAt(view.missionDay, opts.launchDate),
    usual,
  }
}

/** Saves and recomputes, then turns the engine's answer into what the result screen shows. */
export async function saveAndExplain(crewId: string, data: Pick<CheckInData, 'day' | 'takenAt'>, answers: CheckInAnswers, database?: VitalisDB): Promise<Outcome[]> {
  return toOutcomes(await saveCheckIn(Number(crewId), answers, data.takenAt, data.day, database))
}
