import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { VitalisDB } from '../../data/db'
import { seedDatabase, type SeedData } from '../../data/seed'
import type { MissionConfig } from '../../data/types'
import { dexieTodayApi } from '../today/dexieTodayApi.ts'
import { loadCheckIn, newTakenAt, saveAndExplain } from './connect'

const STORES = ['crew_member', 'metric', 'reference_source', 'measurement', 'radiation_dose_log', 'alert', 'action_log'] as const
const read = (n: string) => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8'))
const mission = read('mission_config') as MissionConfig

let db: VitalisDB
let api: ReturnType<typeof dexieTodayApi>
beforeAll(async () => {
  db = new VitalisDB('checkin-connect')
  await seedDatabase(Object.fromEntries(STORES.map((s) => [s, read(s)])) as unknown as SeedData, db)
  api = dexieTodayApi({ database: db, mission })
})

const opts = () => ({ database: db, launchDate: mission.launch_date })
const rowsOn = (crewId: number, day: number) => db.measurement.where('crew_id').equals(crewId).filter((m) => m.mission_day === day).toArray()

describe('check-in on the database', () => {
  it('stamps a new check-in on the mission calendar (day 1 = launch)', () => {
    expect(newTakenAt(142, '2031-02-01', new Date('2026-11-15T09:30:00Z'))).toBe('2031-06-22T09:30:00.000Z')
    expect(newTakenAt(1, '2031-02-01', new Date('2026-11-15T09:30:00Z'))).toBe('2031-02-01T09:30:00.000Z')
  })

  it("opens on today's check-in (Edit) with its time stamp, and gives bands under the database ids", async () => {
    const d = await loadCheckIn(api, '4', undefined, opts()) // Ravi, already checked in on day 142
    expect(d.name).toBe('Ravi Menon')
    expect(d.day).toBe(mission.today_mission_day)
    expect(d.takenAt).toBe('2031-06-22T07:19:00Z')
    expect(d.existing?.temp?.value).toBeGreaterThan(37.9)
    expect(Object.keys(d.usual)).toEqual(expect.arrayContaining(['hr', 'sys', 'dia']))
    expect(Object.keys(d.usual)).not.toContain('bp_sys')
    expect(Object.keys(d.usual)).not.toContain('rad')
  })

  it('saving again is an edit: same rows, new values, and a fever stays on the result screen', async () => {
    const d = await loadCheckIn(api, '4', undefined, opts())
    const before = await rowsOn(4, d.day)
    const first = await saveAndExplain('4', d, { temp: { value: 39.2, context: 'resting' } }, db)
    expect(first[0]).toMatchObject({ metric: 'temp', level: 'alert' })
    const again = await saveAndExplain('4', d, { temp: { value: 39.4, context: 'resting' } }, db)
    expect(again[0]).toMatchObject({ metric: 'temp', level: 'alert', change: 'ongoing' }) // not "nothing new"
    const after = await rowsOn(4, d.day)
    expect(after).toHaveLength(before.length) // no second reading for the day
    expect(after.find((m) => m.metric_id === 'temp')?.value).toBe(39.4)
  })

  it('a person with no check-in yet gets a blank form and a fresh time stamp', async () => {
    const id = await db.crew_member.add({ name: 'New Member', role: 'Pilot', sex: 'F', initials: 'NM', prior_dose_msv: 0, joined_mission_day: 142, removed_at: null, is_simulated: false } as never)
    const d = await loadCheckIn(api, String(id), undefined, opts())
    expect(d.existing).toBeUndefined()
    expect(d.takenAt.startsWith('2031-06-22T')).toBe(true)
  })

  it('refuses a simulated id instead of writing under a wrong person', async () => {
    await expect(loadCheckIn(api, 'amara', undefined, opts())).rejects.toThrow(/database crew id/)
  })
})
