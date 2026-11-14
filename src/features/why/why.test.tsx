import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { simulatedTodayApi, MISSION } from '../today/simulate.ts'
import { parseFrozen } from '../today/api.ts'
import { isFlagged } from '../today/model.ts'
import type { RadiationDose } from '../../data/types'
import { evaluateRadiation } from '../../engine/radiation'
import { fromReading, fromReportMetric, fromReportRadiation, whySentence, type WhyEvidence } from './evidence.ts'
import { radiationEvidence } from './radiationEvidence.ts'
import { WhyModal } from './WhyModal'

const html = (e: WhyEvidence) => renderToStaticMarkup(<WhyModal e={e} onClose={() => {}} />)
const base: WhyEvidence = { id: 'temp', label: 'Temperature', unit: '°C', decimals: 1, level: 'alert', usual: [36.7, 37.1], points: [{ value: 36.9 }, { value: 38.4 }] }

describe('3-step ladder (#22)', () => {
  it('shows exactly three numbered steps when guidance exists', () => {
    const h = html({ ...base, id: 'hr', label: 'Resting heart rate', unit: 'bpm', decimals: 0 })
    expect(h).toContain('What to do, in 3 steps')
    const steps = h.match(/class="[^"]*rungTitle[^"]*"/g) ?? []
    expect(steps.length).toBe(3)
    for (const title of ['Self-care', 'Crew check-in', 'Note for Earth']) expect(h).toContain(title)
  })
  it('uses the Alert step for Alert, the plain step for Watch', () => {
    const a = html({ ...base, id: 'symptoms', label: 'Symptoms', unit: '/3', decimals: 0, level: 'alert' })
    const w = html({ ...base, id: 'symptoms', label: 'Symptoms', unit: '/3', decimals: 0, level: 'watch' })
    expect(a).toContain('Tell the crew medic now.')
    expect(w).toContain('Log any change in your next check-in.')
  })
})

describe('source pending when guidance is missing (#22)', () => {
  it('says so explicitly and shows no steps', () => {
    const h = html({ ...base, id: 'no_such_metric', label: 'Mystery' })
    expect(h).toContain('Source pending')
    expect(h).toContain('No guidance has been written for Mystery yet')
    expect(h).not.toContain('What to do, in 3 steps')
  })
  it('flags a tentative source as "not a citation"', () => {
    expect(html({ ...base, id: 'vision', label: 'Vision', unit: '/3', decimals: 0 })).toContain('Source pending (not a citation)')
  })
})

describe('frozen alert evidence (#22)', () => {
  it('labels frozen evidence, keeps it apart from the latest value, and live evidence says it is live', () => {
    const frozen = html({ ...base, points: [{ value: 36.9 }, { value: 38.2 }], frozen: { raisedDay: 139 }, latest: 38.9 })
    expect(frozen).toContain('Frozen evidence · as of day 139')
    expect(frozen).toContain('does not change when you log new readings')
    expect(frozen).toContain('Since then:')
    expect(frozen).toContain('On day 139 the reading 38.2')
    const live = html(base)
    expect(live).toContain('Live readings · no snapshot stored')
    expect(live).not.toContain('Frozen evidence')
  })
  it('a simulated flagged reading carries a snapshot that does not move when the day moves on', async () => {
    let checked = 0
    for (const id of ['amara', 'kenji', 'lucia', 'ravi']) {
      const today = await simulatedTodayApi.getToday(id)
      for (const r of today.readings.filter((x) => isFlagged(x.level))) {
        expect(r.alert, `${id}/${r.id} is flagged so it must carry a snapshot`).toBeDefined()
        expect(r.alert!.raisedDay).toBeLessThanOrEqual(today.missionDay)
        const e = fromReading(r)
        expect(e.frozen?.raisedDay).toBe(r.alert!.raisedDay)
        checked++
        // the same alert seen one day later: same raise day, same frozen points
        const later = (await simulatedTodayApi.getToday(id, Math.min(MISSION.arrivalDay, today.missionDay + 1))).readings.find((x) => x.id === r.id)!
        if (later.alert && later.alert.raisedDay === r.alert!.raisedDay) expect(later.alert.points).toEqual(r.alert!.points)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
  it('report metrics and radiation carry snapshots too', async () => {
    const rep = await simulatedTodayApi.getReport('kenji')
    for (const m of rep.metrics) expect(Boolean(m.alert)).toBe(isFlagged(m.level))
    const flaggedMetric = rep.metrics.find((m) => isFlagged(m.level))
    if (flaggedMetric) expect(fromReportMetric(flaggedMetric).frozen).toBeDefined()
  })
  it('parseFrozen accepts absent, rejects junk', () => {
    expect(parseFrozen(undefined, 'x')).toBeUndefined()
    expect(parseFrozen({ raisedDay: 3, value: 1, points: [1, 2] }, 'x')).toEqual({ raisedDay: 3, value: 1, usual: undefined, points: [1, 2] })
    expect(() => parseFrozen({ raisedDay: 'a', points: [] }, 'x')).toThrow()
    expect(() => parseFrozen({ raisedDay: 1, points: ['z'] }, 'x')).toThrow()
  })
})

describe('Why? from a Radiation alert (#22)', () => {
  it('Report radiation evidence opens the modal with the career-dose sentence', async () => {
    const rep = await simulatedTodayApi.getReport('kenji', { day: 150 }) // day 150 is a simulated storm day
    const e = fromReportRadiation(rep, 'alert')
    expect(e.id).toBe('rad')
    expect(whySentence(e)).toMatch(/career dose .* mSv, against the 600 mSv career limit/)
    expect(e.frozen?.raisedDay).toBeLessThanOrEqual(150)
    const h = html(e)
    expect(h).toContain('Why is Career dose flagged?')
    expect(h).toContain('Move to the storm shelter now')
    expect(h).toContain('NASA-STD-3001 Vol. 1')
  })
  it('Radiation tab: no evidence when Normal; frozen at the day the Watch started when flagged', () => {
    const dose = (day: number, msv: number): RadiationDose => ({ id: day, crew_id: 1, mission_day: day, date: '', dose_msv: msv, environment: 'mars_transit', sep_flag: false, event_id: null, is_simulated: true })
    const calm = Array.from({ length: 30 }, (_, i) => dose(i + 1, 1))
    const input = { doses: calm, priorDoseMsv: 10, currentDay: 30, arrivalDay: 60 }
    expect(radiationEvidence(input, evaluateRadiation(input))).toBeNull()
    // from day 21 the dose rate jumps, pushing the arrival projection past 80% of 600
    const hot = Array.from({ length: 30 }, (_, i) => dose(i + 1, i + 1 >= 21 ? 14 : 1))
    const hotInput = { doses: hot, priorDoseMsv: 10, currentDay: 30, arrivalDay: 60 }
    const now = evaluateRadiation(hotInput)
    expect(now.state).not.toBe('ok')
    const e = radiationEvidence(hotInput, now)!
    expect(e.frozen!.raisedDay).toBeGreaterThanOrEqual(21)
    expect(e.frozen!.raisedDay).toBeLessThanOrEqual(30)
    expect(e.latest).toBeCloseTo(now.careerMsv, 0)
    // frozen: the last point is the career dose ON the raise day, not today's
    expect(e.points.at(-1)!.day).toBe(e.frozen!.raisedDay)
    expect(html(e)).toContain('Frozen evidence')
  })
})
