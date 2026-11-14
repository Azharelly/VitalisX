import { ZONES, type Level, type Reading, type TodayView, type ZoneId } from './model.ts'

export interface CrewSummary {
  id: string
  name: string
  role: string
}

/**
 * The data contract for the Today screen. Any backend can implement it:
 *   GET /crew                      -> CrewSummary[]
 *   GET /crew/:crewId/today?day=N  -> TodayView   (day omitted = current mission day)
 * Implementations today: simulatedTodayApi (in-browser, simulated data) and httpTodayApi (a real server).
 * A Dexie/IndexedDB implementation can slot in the same way.
 */
export interface TodayApi {
  listCrew(): Promise<CrewSummary[]>
  getToday(crewId: string, day?: number): Promise<TodayView>
}

export function httpTodayApi(baseUrl: string, fetchImpl: typeof fetch = fetch): TodayApi {
  const get = async (path: string): Promise<unknown> => {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`Request failed (${res.status}) for ${path}`)
    return res.json()
  }
  return {
    listCrew: async () => parseCrew(await get('/crew')),
    getToday: async (crewId, day) =>
      parseTodayView(await get(`/crew/${encodeURIComponent(crewId)}/today${day === undefined ? '' : `?day=${day}`}`)),
  }
}

// ── Validation at the trust boundary: never render server JSON we have not checked. ──

const LEVELS: Level[] = ['ok', 'watch', 'alert', 'learn', 'none']
const ZONE_IDS = ZONES.map((z) => z.id)

class BadData extends Error {
  constructor(where: string) {
    super(`Invalid data from server: ${where}`)
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, where: string, max = 200): string => {
  if (typeof v !== 'string' || v.length > max) throw new BadData(where)
  return v
}
const optStr = (v: unknown, where: string) => (v === undefined || v === null ? undefined : str(v, where))
const num = (v: unknown, where: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BadData(where)
  return v
}

export function parseCrew(json: unknown): CrewSummary[] {
  if (!Array.isArray(json)) throw new BadData('crew list')
  return json.map((c, i) => {
    if (!isObj(c)) throw new BadData(`crew[${i}]`)
    return { id: str(c.id, `crew[${i}].id`), name: str(c.name, `crew[${i}].name`, 40), role: str(c.role, `crew[${i}].role`, 40) }
  })
}

function parseReading(r: unknown, i: number): Reading {
  const at = `readings[${i}]`
  if (!isObj(r)) throw new BadData(at)
  if (!LEVELS.includes(r.level as Level)) throw new BadData(`${at}.level`)
  if (!ZONE_IDS.includes(r.zone as ZoneId)) throw new BadData(`${at}.zone`)
  const usual = r.usual === undefined || r.usual === null ? undefined : r.usual
  if (usual !== undefined && !(Array.isArray(usual) && usual.length === 2)) throw new BadData(`${at}.usual`)
  const trend = r.trend === undefined || r.trend === null ? undefined : r.trend
  if (trend !== undefined && !Array.isArray(trend)) throw new BadData(`${at}.trend`)
  return {
    id: str(r.id, `${at}.id`),
    label: str(r.label, `${at}.label`),
    zone: r.zone as ZoneId,
    value: r.value === null ? null : num(r.value, `${at}.value`),
    unit: str(r.unit, `${at}.unit`, 40),
    decimals: Math.min(3, Math.max(0, Math.round(num(r.decimals, `${at}.decimals`)))),
    level: r.level as Level,
    priority: num(r.priority, `${at}.priority`),
    usual: usual && [num(usual[0], `${at}.usual[0]`), num(usual[1], `${at}.usual[1]`)],
    trend: trend?.map((v, k) => num(v, `${at}.trend[${k}]`)),
    context: optStr(r.context, `${at}.context`),
    measured: optStr(r.measured, `${at}.measured`),
    note: optStr(r.note, `${at}.note`),
    action: optStr(r.action, `${at}.action`),
  }
}

export function parseTodayView(json: unknown): TodayView {
  if (!isObj(json) || !isObj(json.person) || !isObj(json.nextAction) || !Array.isArray(json.readings)) throw new BadData('today view')
  return {
    person: { name: str(json.person.name, 'person.name', 40), role: str(json.person.role, 'person.role', 40) },
    missionDay: num(json.missionDay, 'missionDay'),
    isSimulated: json.isSimulated === true,
    nextAction: { text: str(json.nextAction.text, 'nextAction.text', 300), metricId: optStr(json.nextAction.metricId, 'nextAction.metricId') },
    readings: json.readings.map(parseReading),
  }
}
