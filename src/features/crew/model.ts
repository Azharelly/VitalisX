// View-model for the Crew board: one card per current crew member, plus the add-member rules.
// Reuses the Today words (Level, Reading, ZONES) so a state means the same thing on every tab.
import { PRIVATE_ZONES, type Zone } from '../../data/types.ts'
import { ZONES, isFlagged, type Level, type Reading, type Sex, type ZoneId } from '../today/model.ts'

export const NAME_MAX = 40
export const ROLE_MAX = 30

/** Zones the rest of the crew may see. Mind & sleep is private (src/data/types.ts PRIVATE_ZONES). */
export const SHARED_ZONES = ZONES.filter((z) => !PRIVATE_ZONES.includes(z.id as Zone))
export const isPrivateZone = (id: ZoneId) => PRIVATE_ZONES.includes(id as Zone)

export interface CrewCard {
  id: string
  name: string
  role: string
  initials: string
  sex: Sex
  /** Ring state: worst shared zone; 'none' before the first check-in. Private zones never count. */
  status: Level
  /** Worst level per shared zone. Private zones are never sent. */
  zones: Partial<Record<ZoneId, Level>>
  /** doneAt = today's check-in time; lastDay = mission day of the last check-in (null = none yet). */
  checkIn: { doneAt?: string; lastDay: number | null }
  /** Watch / Alert readings in shared zones, most urgent first. */
  attention: Reading[]
}

export interface CrewBoard {
  missionDay: number
  isSimulated: boolean
  /** Current crew only: members with removed_at set are left out (their data is kept). */
  members: CrewCard[]
}

export interface NewMember {
  name: string
  role: string
  sex: Sex | ''
}

export type NewMemberErrors = Partial<Record<keyof NewMember, string>>

/** The add-member rules, used by the form and again by the backend: never trust the client alone. */
export function checkNewMember(m: NewMember, currentNames: string[]): NewMemberErrors {
  const name = m.name.trim()
  const errors: NewMemberErrors = {}
  if (!name) errors.name = 'Enter a name.'
  else if (name.length > NAME_MAX) errors.name = `Use ${NAME_MAX} characters or fewer.`
  else if (currentNames.includes(name)) errors.name = `${name} is already on the crew.`
  if (m.role.trim().length > ROLE_MAX) errors.role = `Use ${ROLE_MAX} characters or fewer.`
  if (m.sex !== 'F' && m.sex !== 'M') errors.sex = 'Choose the body drawing for Today.'
  return errors
}

export const initialsOf = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}

export function checkInText(c: CrewCard, day: number): string {
  if (c.checkIn.doneAt) return `Checked in ${c.checkIn.doneAt}`
  if (c.checkIn.lastDay === null) return 'No check-ins yet'
  const gap = day - c.checkIn.lastDay
  return gap <= 1 ? 'Check-in due' : `No check-in for ${gap} days`
}

/** Numbers for the summary strip. */
export function summarize(members: CrewCard[]) {
  const count = (l: Level) => members.filter((m) => m.status === l).length
  return {
    alert: count('alert'),
    watch: count('watch'),
    ok: count('ok'),
    learn: count('learn'),
    none: count('none'),
    checkedIn: members.filter((m) => m.checkIn.doneAt).length,
    items: members.reduce((n, m) => n + m.attention.filter((r) => isFlagged(r.level)).length, 0),
  }
}
