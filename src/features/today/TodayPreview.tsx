import { useEffect, useState } from 'react'
import type { CrewSummary, TodayApi } from './api.ts'
import { MISSION, simulatedTodayApi } from './simulate.ts'
import { Today } from './Today'
import s from './today.module.css'

/**
 * Demo harness: pick a crew member and scrub the mission day to watch Today react.
 * Not the product UI (the person switcher belongs to Crew / the app header).
 */
export function TodayPreview({ api = simulatedTodayApi }: { api?: TodayApi }) {
  const [crew, setCrew] = useState<CrewSummary[]>([])
  const [crewId, setCrewId] = useState('ravi')
  const [day, setDay] = useState(MISSION.currentDay)

  useEffect(() => {
    api.listCrew().then(setCrew, () => setCrew([]))
  }, [api])

  return (
    <div className={s.previewWrap}>
      <div className={s.previewBar} role="group" aria-label="Demo controls">
        <span className={s.demoTag}>Demo</span>
        <div className={s.previewCrew}>
          {crew.map((c) => (
            <button key={c.id} type="button" className={s.previewBtn} aria-pressed={c.id === crewId} onClick={() => setCrewId(c.id)}>
              {c.name.split(' ')[0]}
            </button>
          ))}
        </div>
        <label className={s.previewDay}>
          <span>
            Mission day <strong>{day}</strong>
          </span>
          <input type="range" min={1} max={MISSION.arrivalDay} value={day} onChange={(e) => setDay(Number(e.target.value))} />
        </label>
        <button type="button" className={s.previewBtn} onClick={() => setDay(MISSION.currentDay)}>
          Reset to day {MISSION.currentDay}
        </button>
      </div>
      <Today api={api} crewId={crewId} day={day} onWhy={(id) => console.info('Why?', id)} />
    </div>
  )
}
