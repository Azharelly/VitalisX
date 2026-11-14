// Why? evidence for the Radiation tab, built from the engine's own evaluation (no second rule set).
import type { RadiationDose } from '../../data/types'
import { evaluateRadiation, type RadiationEval, type RadiationInput } from '../../engine/radiation'
import type { WhyEvidence } from './evidence.ts'

const SCAN_DAYS = 60
const TREND_DAYS = 7
const flagged = (s: string) => s === 'watch' || s === 'alert'

/** Career dose after each mission day up to `day` (prior dose included). */
function careerAt(doses: RadiationDose[], prior: number, day: number) {
  return prior + doses.filter((d) => d.mission_day <= day).reduce((s, d) => s + d.dose_msv, 0)
}

/**
 * Why? for a Watch / Alert on the Radiation tab. The evidence is frozen at the day this run of Watch / Alert began,
 * found by re-evaluating earlier days with only the doses known then (a storm reported by DONKI counts for today only).
 */
export function radiationEvidence(input: RadiationInput, now: RadiationEval): WhyEvidence | null {
  if (!flagged(now.state)) return null
  const { doses, priorDoseMsv, arrivalDay } = input
  let day = input.currentDay
  while (day > 1 && input.currentDay - day < SCAN_DAYS) {
    const before = evaluateRadiation({ doses: doses.filter((d) => d.mission_day <= day - 1), priorDoseMsv, currentDay: day - 1, arrivalDay })
    if (!flagged(before.state)) break
    day--
  }
  const first = Math.max(1, day - TREND_DAYS + 1)
  const points = Array.from({ length: day - first + 1 }, (_, i) => ({ day: first + i, value: Number(careerAt(doses, priorDoseMsv, first + i).toFixed(1)) }))
  return {
    id: 'rad', label: 'Career dose', unit: 'mSv', decimals: 0, level: now.state,
    points, frozen: { raisedDay: day }, latest: Number(now.careerMsv.toFixed(1)),
    note: now.reasons.join(' '),
  }
}
