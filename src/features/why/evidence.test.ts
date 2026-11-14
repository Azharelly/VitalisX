import { describe, expect, it } from 'vitest'
import { fromReportMetric, whySentence, type WhyEvidence } from './evidence.ts'

const base: WhyEvidence = { id: 'temp', label: 'Temperature', unit: '°C', decimals: 1, level: 'alert', usual: [36.7, 37.1], points: [{ value: 36.9 }, { value: 38.4 }] }

describe('Why? evidence (#22)', () => {
  it('says how far above the usual range the latest reading is', () => {
    expect(whySentence(base)).toBe('Latest 38.4 °C is 1.3 °C above your usual range 36.7–37.1 °C.')
  })
  it('says below when under the range', () => {
    expect(whySentence({ ...base, points: [{ value: 36.2 }] })).toContain('0.5 °C below')
  })
  it('names the fixed rule when there is no personal range', () => {
    expect(whySentence({ ...base, usual: undefined })).toContain('fixed rule')
  })
  it('drops days without a reading from the chart', () => {
    const e = fromReportMetric({ id: 'temp', label: 'T', zone: 'immune', unit: '°C', decimals: 1, priority: 1, level: 'alert', avg: null, prevAvg: null,
      points: [{ day: 1, value: 37, level: 'ok' }, { day: 2, value: null, level: 'none' }, { day: 3, value: 38.2, level: 'alert' }] })
    expect(e.points.map((p) => p.day)).toEqual([1, 3])
  })
})
