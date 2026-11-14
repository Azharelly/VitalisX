import { useState } from 'react'
import type { CrewApi } from '../crew/api.ts'
import { AvatarRow } from '../crew/AvatarRow'
import { CrewProvider } from '../crew/CrewProvider'
import { CrewScreen } from '../crew/CrewScreen'
import { useCrew } from '../crew/useCrew.ts'
import { Report } from '../report/Report'
import type { TodayApi } from './api.ts'
import { MISSION, simulatedCrewApi, simulatedTodayApi } from './simulate.ts'
import { Today } from './Today'
import s from './today.module.css'

type Tab = 'crew' | 'today' | 'report'

/**
 * Demo harness: a mini app shell with the avatar row on top and the Crew / Today / Report tabs.
 * Choosing an avatar switches the person on every tab. Scrub the mission day to watch the pages react.
 * Every action a page emits is shown in the bar, so you can see what the app must wire.
 */
export function TodayPreview({ api = simulatedTodayApi, crewApi = simulatedCrewApi }: { api?: TodayApi; crewApi?: CrewApi }) {
  const [day, setDay] = useState(MISSION.currentDay)
  const [event, setEvent] = useState('Actions you trigger appear here.')
  const [tab, setTab] = useState<Tab>('crew')
  const log = (name: string, ...args: (string | undefined)[]) => setEvent(`${name}(${args.filter(Boolean).map((a) => `'${a}'`).join(', ')})`)

  return (
    <CrewProvider api={crewApi} day={day}>
      <div className={s.previewWrap}>
        <div className={s.previewBar} role="group" aria-label="Demo controls">
          <span className={s.demoTag}>Demo</span>
          <div className={s.previewCrew} role="group" aria-label="Tab">
            {(['crew', 'today', 'report'] as const).map((v) => (
              <button key={v} type="button" className={s.previewBtn} aria-pressed={tab === v} onClick={() => setTab(v)}>
                {v[0].toUpperCase() + v.slice(1)}
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
          <output className={s.previewEvent} aria-live="polite">
            {event}
          </output>
        </div>
        <AvatarRow />
        <Tabs tab={tab} setTab={setTab} api={api} day={day} log={log} />
      </div>
    </CrewProvider>
  )
}

interface TabsProps {
  tab: Tab
  setTab: (t: Tab) => void
  api: TodayApi
  day: number
  log: (name: string, ...args: (string | undefined)[]) => void
}

function Tabs({ tab, setTab, api, day, log }: TabsProps) {
  const { selected } = useCrew()
  if (tab === 'crew' || !selected) return <CrewScreen onOpenPerson={() => setTab('today')} />
  if (tab === 'report') {
    return (
      <Report
        key={selected.id}
        api={api}
        crewId={selected.id}
        day={day}
        onBack={() => setTab('today')}
        onSendSummary={(id, days) => log('onSendSummary', id, String(days))}
        onWhy={(m) => log('onWhy', m)}
      />
    )
  }
  return (
    <Today
      api={api}
      crewId={selected.id}
      day={day}
      onBack={() => setTab('crew')}
      onEmergency={(id) => log('onEmergency', id)}
      onWhy={(m) => log('onWhy', m)}
      onStart={(id, m) => log('onStart', id, m)}
      onNoteForEarth={(id, m) => log('onNoteForEarth', id, m)}
      onStartCheckIn={(id) => log('onStartCheckIn', id)}
      onOpenReport={() => setTab('report')}
    />
  )
}
