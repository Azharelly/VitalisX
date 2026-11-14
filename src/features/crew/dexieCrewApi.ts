// The Crew board contract (CrewApi) on top of the local database. Adding a member writes a crew_member row;
// removing one only sets removed_at, so the person's history stays (PRD F-01).

import { db as defaultDb } from '../../data/db'
import { getActiveCrew, removeCrewMember } from '../../data/queries'
import { crewCardOf, type DexieTodayApiOptions } from '../today/dexieTodayApi.ts'
import type { CrewApi } from './api.ts'
import { checkNewMember, initialsOf } from './model.ts'

export function dexieCrewApi({ database = defaultDb, mission }: DexieTodayApiOptions): CrewApi {
    const getMission = async () => (typeof mission === 'function' ? mission() : mission)
    return {
        getBoard: async (day) => {
            const m = await getMission()
            const d = day ?? m.today_mission_day
            if (!Number.isInteger(d) || d < 1 || d > m.arrival_day) throw new Error(`Mission day out of range: ${d}`)
            const crew = await getActiveCrew(database)
            const members = await Promise.all(crew.map((c) => crewCardOf(database, m, String(c.id), d)))
            return { missionDay: d, isSimulated: crew.length === 0 || crew.some((c) => c.is_simulated), members }
        },

        addMember: async (member) => {
            const m = await getMission()
            const current = await getActiveCrew(database)
            const errors = checkNewMember(member, current.map((c) => c.name))
            if (Object.keys(errors).length || (member.sex !== 'F' && member.sex !== 'M')) throw new Error(Object.values(errors).join(' '))
            const name = member.name.trim()
            const role = member.role.trim()
            // Ids are never reused, so a removed person keeps their own history.
            const id = ((await database.crew_member.orderBy('id').last())?.id ?? 0) + 1
            await database.crew_member.add({
                id, name, role, sex: member.sex, initials: initialsOf(name),
                prior_dose_msv: 0, joined_mission_day: m.today_mission_day, removed_at: null, is_simulated: true,
            })
            return { id: String(id), name, role }
        },

        removeMember: async (crewId) => {
            if (!(await removeCrewMember(Number(crewId), undefined, database))) throw new Error(`Unknown crew member: ${crewId}`)
        },
    }
}