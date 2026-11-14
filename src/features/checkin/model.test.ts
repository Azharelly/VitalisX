import { describe, expect, it } from 'vitest'
import { DEMO_FORM, EMPTY_FORM, atypical, fromAnswers, parseNumber, toAnswers, type FormState } from './model'

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
