import { describe, expect, it } from 'vitest'
import { DEMO_FORM, EMPTY_FORM, atypical, fromAnswers, outcomeHeadline, parseNumber, savedSummary, toAnswers, toOutcomes, type FormState } from './model'

const form = (patch: Partial<FormState>): FormState => ({ ...EMPTY_FORM, ...patch })

describe('check-in form (PRD F-03)', () => {
  it('reads a decimal comma, rejects junk, and leaves blank as blank', () => {
    expect(parseNumber('37,5')).toBe(37.5)
    expect(parseNumber('  ')).toBeUndefined()
    expect(parseNumber('1e3')).toBeNaN()
    expect(parseNumber('-5')).toBeNaN()
  })

  it('sends only filled metrics, with context, and never a 0 for an empty field', () => {
    const { answers, errors } = toAnswers(form({ text: { temp: '37,2', hr: '', sleep: '6.5' }, context: { ...EMPTY_FORM.context, temp: 'after_exercise' } }))
    expect(errors).toEqual({})
    expect(answers).toEqual({ temp: { value: 37.2, context: 'after_exercise' }, sleep: { value: 6.5 } })
  })

  it('catches typos outside the plausible range (370 for 37.0)', () => {
    expect(toAnswers(form({ text: { temp: '370' } })).errors.temp).toMatch(/between 30 and 45/)
    expect(toAnswers(form({ text: { temp: '370' } })).answers.temp).toBeUndefined()
  })

  it('needs both blood-pressure numbers, diastolic below systolic, sharing one context', () => {
    expect(toAnswers(form({ text: { sys: '120' } })).errors.dia).toBeDefined()
    expect(toAnswers(form({ text: { sys: '80', dia: '120' } })).errors.dia).toMatch(/lower/)
    const { answers } = toAnswers(form({ text: { sys: '118', dia: '76' }, context: { ...EMPTY_FORM.context, sys: 'after_exercise' } }))
    expect(answers.dia).toEqual({ value: 76, context: 'after_exercise' })
  })

  it('stores fluids in litres and severities as 0–3', () => {
    expect(toAnswers(form({ fluidsMl: 1750, symptoms: 0, vision: 2 })).answers).toEqual({ fluids: { value: 1.75 }, symptoms: { value: 0 }, vision: { value: 2 } })
  })

  it('round-trips saved answers for Edit', () => {
    const { answers } = toAnswers(DEMO_FORM)
    expect(toAnswers(fromAnswers(answers)).answers).toEqual(answers)
  })

  it('flags a plausible but very unusual value (|z| ≥ 3) for confirmation', () => {
    const usual = { temp: [36.7, 37.1] as [number, number] } // mid 36.9, half-width 0.2
    expect(atypical({ temp: { value: 37.2 } }, usual)).toEqual([])
    expect(atypical({ temp: { value: 39.5 } }, usual)[0]).toMatch(/far from your usual/)
  })
})

describe('check-in result', () => {
  // The parts of saveCheckIn()'s result that the screen reads.
  const changed = (metric_id: string, change: string, level: string | null, value: number, median: number | null, rule: string | null = null) =>
    ({ metric_id, result: { change, alert: level ? { level } : null, eval: { value, rule, baseline: median === null ? null : { median } } } }) as never

  it('puts the most urgent change first: level, then metric priority', () => {
    const out = toOutcomes({
      results: [changed('sleep', 'opened', 'watch', 5.1, 6.5), changed('temp', 'opened', 'alert', 39.2, 36.9), changed('hr', 'opened', 'watch', 80, 66), changed('mood', 'resolved', null, 4, 4)],
    })
    expect(out.map((o) => `${o.metric}:${o.level}`)).toEqual(['temp:alert', 'hr:watch', 'sleep:watch', 'mood:ok'])
  })

  it('says which way a reading moved, falls back to the rule, and words a resolved alert', () => {
    const [temp, symptoms, sleep, sys] = toOutcomes({ // sorted: alert, then watch by priority (symptoms 5 before sleep 8), then resolved
      results: [
        changed('temp', 'opened', 'alert', 39.2, 36.9),
        changed('sleep', 'escalated', 'watch', 5.1, 6.5),
        changed('symptoms', 'opened', 'watch', 2, null, 'Symptoms reported (2 of 3).'),
        changed('sys', 'resolved', null, 112, 113),
      ],
    })
    expect(outcomeHeadline(temp)).toBe('Temperature is far above your usual')
    expect(outcomeHeadline(sleep)).toBe('Sleep is below your usual')
    expect(outcomeHeadline(symptoms)).toBe('Symptoms reported (2 of 3).')
    expect(outcomeHeadline(sys)).toBe('Blood pressure is back to normal for you')
  })

  it('keeps an alert that is still open (a repeat fever is not "nothing new"), drops untouched metrics, merges blood pressure', () => {
    const out = toOutcomes({
      results: [
        changed('temp', 'updated', 'alert', 39.2, 36.9),
        changed('sleep', 'unchanged', null, 6.5, 6.5),
        changed('sys', 'opened', 'watch', 140, 113),
        changed('dia', 'opened', 'watch', 95, 72),
      ],
    })
    expect(out.map((o) => `${o.metric}:${o.change}`)).toEqual(['temp:ongoing', 'sys:opened'])
  })

  it('names what was left empty after saving, blood pressure once', () => {
    const all = toAnswers(form({ text: { sleep: '7', hr: '60', spo2: '98', temp: '36.6', glucose: '90', sys: '120', dia: '80', weight: '70', exercise: '30' }, fluidsMl: 2000, mood: 4, symptoms: 0, vision: 0 })).answers
    expect(savedSummary(all)).toEqual({ saved: '13 readings', empty: '' })
    const without = (...ids: string[]) => Object.fromEntries(Object.entries(all).filter(([id]) => !ids.includes(id)))
    expect(savedSummary(without('temp'))).toEqual({ saved: '12 of 13 readings', empty: 'Temperature was left empty.' })
    expect(savedSummary(without('temp', 'sys', 'dia')).empty).toBe('Temperature and Blood pressure were left empty.')
  })
})
