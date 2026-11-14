import { useEffect, useState } from 'react'
import type { CheckInMetricId } from '../../data/checkin'
import type { MetricId } from '../../data/types'
import { useCrew } from '../crew/useCrew.ts'
import type { TodayApi } from '../today/api.ts'
import t from '../today/today.module.css'
import { CheckInScreen, type CheckInScreenProps } from './CheckInScreen'
import { useCheckInWhy } from './useCheckInWhy'
import { METRIC_LABEL, type CheckInAnswers, type Outcome } from './model'

type Bands = Partial<Record<MetricId, [number, number]>>

/**
 * Demo only: the Check-in screen inside the app preview. Bands come from the simulated Today data and saving
 * stores nothing: a rough stand-in for the engine decides the result. The real wiring is
 * `onSave={async (a) => toOutcomes(await saveCheckIn(Number(crewId), a, takenAt, day))}`.
 */
export function CheckInPreview({ api, crewId, day, ...actions }: { api: TodayApi; crewId: string; day?: number } & Pick<
  CheckInScreenProps,
  'onDone' | 'onEmergency' | 'onWhy' | 'onNoteForEarth'
>) {
  const { selected } = useCrew()
  const [usual, setUsual] = useState<Bands>({})
  const why = useCheckInWhy(api, crewId, day)

  useEffect(() => {
    let live = true
    api.getToday(crewId, day).then(
      (v) => live && setUsual(Object.fromEntries(v.readings.filter((r) => r.usual).map((r) => [ID[r.id] ?? r.id, r.usual!]))),
      () => live && setUsual({}), // no bands: the form still works, it just cannot flag unusual values
    )
    return () => {
      live = false
    }
  }, [api, crewId, day])

  return (
    <>
      <CheckInScreen
        key={crewId}
        name={selected?.name ?? 'Crew member'}
        day={day}
        usual={usual}
        onSave={async (a) => previewOutcomes(a, usual)}
        {...actions}
        onWhy={(m) => {
          actions.onWhy?.(m)
          void why.open(m)
        }}
      />
      {why.error && (
        <p className={t.fine} role="alert">
          {why.error}
        </p>
      )}
      {why.modal}
    </>
  )
}

// The simulated Today data still uses its old blood-pressure ids.
const ID: Record<string, MetricId> = { bp_sys: 'sys', bp_dia: 'dia' }

/** Stand-in for saveCheckIn(): Alert at |z| ≥ 3 from the band, the fever and SpO₂ limits, and severity 3; Watch at severity 1–2. */
function previewOutcomes(answers: CheckInAnswers, usual: Bands): Outcome[] {
  const out: Outcome[] = []
  for (const [id, a] of Object.entries(answers) as [CheckInMetricId, { value: number }][]) {
    const band = usual[id]
    const median = band ? (band[0] + band[1]) / 2 : null
    const scale = band ? (band[1] - band[0]) / 3 : 0 // band = median ± 1.5 × scale
    const severity = id === 'symptoms' || id === 'vision'
    const level =
      (severity && a.value >= 3) || (id === 'temp' && a.value > 37.9) || (id === 'spo2' && a.value < 92) || (median !== null && scale > 0 && Math.abs(a.value - median) >= 3 * scale)
        ? 'alert'
        : severity && a.value >= 1
          ? 'watch'
          : null
    if (level) {
      out.push({
        metric: id, label: METRIC_LABEL[id], level, change: 'opened', value: a.value, median,
        rule: severity ? `${METRIC_LABEL[id]} reported (${a.value} of 3).` : id === 'temp' && a.value > 37.9 ? 'Fever from 38.0 °C.' : null,
      })
    }
  }
  return out.sort((x, y) => (x.level === y.level ? 0 : x.level === 'alert' ? -1 : 1))
}
