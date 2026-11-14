import { useState } from 'react'
import { RadiationScreen } from '../RadiationScreen'
import { MISSION, simulatedCrewApi, simulatedTodayApi } from '../today/simulate.ts'
import { AppShell } from './AppShell'
import s from './shell.module.css'

/**
 * Demo: the full app on simulated data, plus a small floating "Demo" panel (mission-day slider and a log of
 * the actions the app emits). Not product UI. Render <AppPreview /> to try everything without wiring.
 */
export function AppPreview() {
  const [day, setDay] = useState(MISSION.currentDay)
  const [event, setEvent] = useState('Actions you trigger appear here.')
  const log = (name: string, ...args: (string | number | undefined)[]) =>
    setEvent(`${name}(${args.filter((a) => a !== undefined).map((a) => `'${a}'`).join(', ')})`)

  return (
    <>
      <AppShell
        crewApi={simulatedCrewApi}
        todayApi={simulatedTodayApi}
        day={day}
        screens={{ radiation: () => <RadiationScreen /> }} // the team's screen, still on its own mock data
        onEmergency={(id) => log('onEmergency', id)}
        onWhy={(m) => log('onWhy', m)}
        onStart={(id, m) => log('onStart', id, m)}
        onNoteForEarth={(id, m) => log('onNoteForEarth', id, m)}
        onSendSummary={(id, d) => log('onSendSummary', id, d)}
      />
      <details className={s.demo}>
        <summary>
          <span className={s.demoTag}>Demo</span> Day {day}
        </summary>
        <div className={s.demoPanel}>
          <label className={s.demoDay}>
            <span>
              Mission day <strong>{day}</strong>
            </span>
            <input type="range" min={1} max={MISSION.arrivalDay} value={day} onChange={(e) => setDay(Number(e.target.value))} />
          </label>
          <button type="button" className={s.demoBtn} onClick={() => setDay(MISSION.currentDay)}>
            Back to day {MISSION.currentDay}
          </button>
          <output className={s.demoLog} aria-live="polite">
            {event}
          </output>
        </div>
      </details>
    </>
  )
}
