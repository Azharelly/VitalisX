import { useEffect, useState } from 'react'
import type { MetricId } from '../../data/types'
import { useCrew } from '../crew/useCrew.ts'
import type { TodayApi } from '../today/api.ts'
import { CheckInScreen } from './CheckInScreen'

/**
 * Demo only: the Check-in screen inside the app preview. Bands come from the simulated Today data; saving stores
 * nothing. The real wiring passes saveCheckIn() as onSave (see README).
 */
export function CheckInPreview({ api, crewId, day, onDone }: { api: TodayApi; crewId: string; day?: number; onDone: () => void }) {
  const { selected } = useCrew()
  const [usual, setUsual] = useState<Partial<Record<MetricId, [number, number]>>>({})

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
    <CheckInScreen
      key={crewId}
      name={selected?.name ?? 'Crew member'}
      day={day}
      usual={usual}
      onDone={onDone}
      onSave={async () => ['Preview: nothing was stored. Real saving uses saveCheckIn() once it is merged.']}
    />
  )
}

// The simulated Today data still uses its old blood-pressure ids.
const ID: Record<string, MetricId> = { bp_sys: 'sys', bp_dia: 'dia' }
