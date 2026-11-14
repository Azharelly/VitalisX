import { parseReading, type CrewSummary } from '../today/api.ts'
import type { Level, ZoneId } from '../today/model.ts'
import { NAME_MAX, ROLE_MAX, SHARED_ZONES, type CrewBoard, type CrewCard, type NewMember } from './model.ts'

/**
 * The data contract for the Crew board. Any backend can implement it:
 *   GET  /crew/board?day=N     -> CrewBoard     (day omitted = current mission day)
 *   POST /crew                 -> CrewSummary   body { name, role, sex }; 422 on a rule break
 *   POST /crew/:crewId/remove  -> 204           sets removed_at; never deletes data
 * Implementations: simulatedCrewApi (src/features/today/simulate.ts) and httpCrewApi.
 */
export interface CrewApi {
  getBoard(day?: number): Promise<CrewBoard>
  addMember(m: NewMember): Promise<CrewSummary>
  removeMember(crewId: string): Promise<void>
}

export function httpCrewApi(baseUrl: string, fetchImpl: typeof fetch = fetch): CrewApi {
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) },
    })
    if (!res.ok) throw new Error(`Request failed (${res.status}) for ${path}`)
    return res.status === 204 ? undefined : res.json()
  }
  return {
    getBoard: async (day) => parseCrewBoard(await call(`/crew/board${day === undefined ? '' : `?day=${day}`}`)),
    addMember: async ({ name, role, sex }) => {
      const c = await call('/crew', { method: 'POST', body: JSON.stringify({ name: name.trim(), role: role.trim(), sex }) })
      if (!isObj(c) || typeof c.id !== 'string') throw new Error('Invalid data from server: new crew member')
      return { id: c.id, name: String(c.name), role: String(c.role) }
    },
    removeMember: async (crewId) => {
      await call(`/crew/${encodeURIComponent(crewId)}/remove`, { method: 'POST' })
    },
  }
}

// ── Validation at the trust boundary ──

const LEVELS: Level[] = ['ok', 'watch', 'alert', 'learn', 'none']
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const bad = (where: string): never => {
  throw new Error(`Invalid data from server: ${where}`)
}
const str = (v: unknown, where: string, max = 200) => (typeof v === 'string' && v.length <= max ? v : bad(where))
const level = (v: unknown, where: string) => (LEVELS.includes(v as Level) ? (v as Level) : bad(where))
const day = (v: unknown, where: string) => (typeof v === 'number' && Number.isInteger(v) ? v : bad(where))

function parseCard(c: unknown, i: number): CrewCard {
  const at = `members[${i}]`
  if (!isObj(c) || !isObj(c.zones) || !isObj(c.checkIn) || !Array.isArray(c.attention)) return bad(at)
  // Keep shared zones only: a private zone sent by mistake is dropped, never shown.
  const zones: Partial<Record<ZoneId, Level>> = {}
  for (const z of SHARED_ZONES) if (c.zones[z.id] !== undefined) zones[z.id] = level(c.zones[z.id], `${at}.zones.${z.id}`)
  const sharedIds = SHARED_ZONES.map((z) => z.id)
  return {
    id: str(c.id, `${at}.id`),
    name: str(c.name, `${at}.name`, NAME_MAX),
    role: str(c.role, `${at}.role`, ROLE_MAX),
    initials: str(c.initials, `${at}.initials`, 3),
    sex: c.sex === 'F' || c.sex === 'M' ? c.sex : bad(`${at}.sex`),
    status: level(c.status, `${at}.status`),
    zones,
    checkIn: {
      doneAt: c.checkIn.doneAt === undefined || c.checkIn.doneAt === null ? undefined : str(c.checkIn.doneAt, `${at}.checkIn.doneAt`, 20),
      lastDay: c.checkIn.lastDay === null ? null : day(c.checkIn.lastDay, `${at}.checkIn.lastDay`),
    },
    attention: c.attention.map(parseReading).filter((r) => sharedIds.includes(r.zone)),
  }
}

export function parseCrewBoard(json: unknown): CrewBoard {
  if (!isObj(json) || !Array.isArray(json.members)) return bad('crew board')
  return { missionDay: day(json.missionDay, 'missionDay'), isSimulated: json.isSimulated === true, members: json.members.map(parseCard) }
}
