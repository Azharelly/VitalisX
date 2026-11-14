import { useState } from 'react'
import type { TodayApi } from '../today/api.ts'
import { fromReading, type WhyEvidence } from '../why/evidence.ts'
import { WhyModal } from '../why/WhyModal'

// Today's readings still use the screen's old ids for blood pressure.
const TO_TODAY_ID: Record<string, string> = { sys: 'bp_sys', dia: 'bp_dia' }

/**
 * "Why am I seeing this?" on the check-in result: the same Why? window as Today, for the reading just saved.
 * Reads the person's Today view at click time, so it shows what the engine says after the save.
 */
export function useCheckInWhy(api: TodayApi, crewId: string, day?: number) {
  const [evidence, setEvidence] = useState<WhyEvidence | null>(null)
  const [error, setError] = useState('')
  const open = async (metricId: string) => {
    setError('')
    try {
      const view = await api.getToday(crewId, day)
      const reading = view.readings.find((r) => r.id === (TO_TODAY_ID[metricId] ?? metricId))
      if (reading) setEvidence(fromReading(reading))
      else setError('No reading to explain yet.')
    } catch {
      setError('Could not load the explanation. Please try again.')
    }
  }
  const modal = evidence ? <WhyModal e={evidence} onClose={() => setEvidence(null)} /> : null
  return { open, modal, error }
}
