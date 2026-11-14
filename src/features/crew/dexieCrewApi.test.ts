import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { VitalisDB } from '../../data/db'
import { seedDatabase, type SeedData } from '../../data/seed'
import type { MissionConfig } from '../../data/types'
import { parseCrewBoard } from './api.ts'
import { dexieCrewApi } from './dexieCrewApi.ts'
import { dexieTodayApi } from '../today/dexieTodayApi.ts'

const STORES = ['crew_member', 'metric', 'reference_source', 'measurement', 'radiation_dose_log', 'alert', 'action_log'] as const
const read = (n: string) => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8'))
const mission = read('mission_config') as MissionConfig

let n = 0
let db: VitalisDB
let api: ReturnType<typeof dexieCrewApi>
beforeEach(async () => {
    db = new VitalisDB(`dexie-crew-${n++}`)
    await seedDatabase(Object.fromEntries(STORES.map((s) => [s, read(s)])) as unknown as SeedData, db)
    api = dexieCrewApi({ database: db, mission })
})

const byName = async (name: string) => (await api.getBoard()).members.find((m) => m.name.startsWith(name))!

describe('dexieCrewApi', () => {
    it('shows the four crew members and the board passes the same validation as server data', async () => {
        const board = await api.getBoard()
        expect(board.members.map((m) => m.name)).toEqual(['Amara Okafor', 'Kenji Tanaka', 'Lucía Fernández', 'Ravi Menon'])
        expect(parseCrewBoard(JSON.parse(JSON.stringify(board)))).toBeTruthy()
    })

    it('rings follow the stories, Mind & sleep included (decision D2)', async () => {
        expect((await byName('Ravi')).status).toBe('alert')
        expect((await byName('Kenji')).status).toBe('watch')
        expect((await byName('Lucía')).status).toBe('ok')
        const amara = await byName('Amara') // her sleep is on Watch, and every zone is visible to the crew
        expect(amara.status).toBe('watch')
        expect(amara.zones.mind).toBe('watch')
        expect(amara.attention.map((r) => r.id)).toContain('sleep')
    })

    it('Ravi needs attention, most urgent first', async () => {
        const ravi = await byName('Ravi')
        expect(ravi.attention[0].id).toBe('temp')
        expect(ravi.checkIn.doneAt).toBeDefined()
    })

    it('adds a member: no data yet, Today still works, and ids are never reused', async () => {
        const added = await api.addMember({ name: ' Noor Haddad ', role: 'Doctor', sex: 'F' })
        expect(added).toEqual({ id: '5', name: 'Noor Haddad', role: 'Doctor' })
        const noor = await byName('Noor')
        expect(noor.status).toBe('none')
        expect(noor.initials).toBe('NH')
        const today = await dexieTodayApi({ database: db, mission }).getToday('5')
        expect(today.nextAction.kind).toBe('learning')
        await api.removeMember('5')
        expect((await api.addMember({ name: 'Zed Lee', role: '', sex: 'M' })).id).toBe('6')
    })

    it('refuses duplicates, empty names and a missing body drawing', async () => {
        await expect(api.addMember({ name: 'Ravi Menon', role: '', sex: 'M' })).rejects.toThrow('already on the crew')
        await expect(api.addMember({ name: '  ', role: '', sex: 'M' })).rejects.toThrow('Enter a name')
        await expect(api.addMember({ name: 'New Person', role: '', sex: '' })).rejects.toThrow('body drawing')
    })

    it('removing hides the person from the board but keeps their data', async () => {
        await api.removeMember('4')
        expect((await api.getBoard()).members.map((m) => m.name)).not.toContain('Ravi Menon')
        expect(await db.measurement.where('crew_id').equals(4).count()).toBeGreaterThan(0)
        await expect(api.removeMember('99')).rejects.toThrow('Unknown crew member')
    })
})