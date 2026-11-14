import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { VitalisDB } from '../../data/db'
import { seedDatabase, type SeedData } from '../../data/seed'
import type { MissionConfig } from '../../data/types'
import { parseReportView, parseTodayView } from './api.ts'
import { dexieTodayApi } from './dexieTodayApi.ts'

const STORES = ['crew_member', 'metric', 'reference_source', 'measurement', 'radiation_dose_log', 'alert', 'action_log'] as const
const read = (n: string) => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8'))

let api: ReturnType<typeof dexieTodayApi>
beforeAll(async () => {
  const db = new VitalisDB('dexie-today-api')
  await seedDatabase(Object.fromEntries(STORES.map((s) => [s, read(s)])) as unknown as SeedData, db)
  api = dexieTodayApi({ database: db, mission: read('mission_config') as MissionConfig })
})

const level = (v: Awaited<ReturnType<typeof api.getToday>>, id: string) => v.readings.find((r) => r.id === id)?.level

describe('dexieTodayApi', () => {
  it('lists the four crew members', async () => {
    expect((await api.listCrew()).map((c) => c.name)).toEqual(['Amara Okafor', 'Kenji Tanaka', 'Lucía Fernández', 'Ravi Menon'])
  })

  it('Ravi: fever is the next action; ids use the names the screen knows', async () => {
    const v = await api.getToday('4')
    expect(level(v, 'temp')).toBe('alert')
    expect(['watch', 'alert']).toContain(level(v, 'hr'))
    expect(v.nextAction).toEqual({ kind: 'metric', metricId: 'temp' })
    const ids = v.readings.map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['bp_sys', 'bp_dia', 'rad']))
    expect(ids).not.toContain('sys')
    expect(ids).not.toContain('rad_projection')
  })

  it('Amara: sleep is on Watch', async () => {
    expect(level(await api.getToday('1'), 'sleep')).toBe('watch')
  })

  it('Kenji: radiation is on Watch and leads', async () => {
    const v = await api.getToday('2')
    expect(level(v, 'rad')).toBe('watch')
    expect(v.nextAction).toEqual({ kind: 'metric', metricId: 'rad' })
  })

  it('Lucía: all clear', async () => {
    const v = await api.getToday('3')
    expect(v.readings.filter((r) => r.level === 'watch' || r.level === 'alert')).toEqual([])
    expect(v.nextAction).toEqual({ kind: 'all-clear' })
  })

  it('every view passes the same validation as data from a server', async () => {
    for (const id of ['1', '2', '3', '4']) {
      const today = await api.getToday(id)
      expect(parseTodayView(JSON.parse(JSON.stringify(today)))).toBeTruthy()
      expect(today.week).toHaveLength(7)
      for (const days of [7, 28] as const) {
        const report = await api.getReport(id, { days })
        expect(parseReportView(JSON.parse(JSON.stringify(report)))).toBeTruthy()
        expect(report.zones).toHaveLength(days)
      }
    }
  })

  it('Ravi report shows the fever event; Kenji career dose adds up', async () => {
    const ravi = await api.getReport('4', { days: 7 })
    expect(ravi.events.some((e) => e.metricId === 'temp' && e.to === 'alert')).toBe(true)
    const kenji = await api.getReport('2', { days: 28 })
    expect(kenji.radiation.careerMsv).toBeGreaterThan(kenji.radiation.priorMsv)
    expect(kenji.radiation.projectedMsv).toBeGreaterThan(kenji.radiation.careerMsv)
    expect(kenji.radiation.daily.some((d) => d.storm)).toBe(true)
  })

  it('rejects unknown people, bad days and bad periods', async () => {
    await expect(api.getToday('99')).rejects.toThrow('Unknown crew member')
    await expect(api.getToday('1', 0)).rejects.toThrow('out of range')
    await expect(api.getReport('1', { days: 14 as 7 })).rejects.toThrow('7 or 28')
  })
})

describe('dexieTodayApi usual band', () => {
  it('Ravi fever (a hard-limit alert) still shows his usual temperature band', async () => {
    const t = (await api.getToday('4')).readings.find((r) => r.id === 'temp')!
    expect(t.level).toBe('alert')
    expect(t.usual).toBeDefined()
    expect(t.usual![1]).toBeLessThan(37.9)
  })
})
