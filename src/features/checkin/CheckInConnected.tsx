import { useEffect, useState } from 'react'
import type { VitalisDB } from '../../data/db'
import type { TodayApi } from '../today/api.ts'
import t from '../today/today.module.css'
import { CheckInScreen, type CheckInScreenProps } from './CheckInScreen'
import s from './checkin.module.css'
import { loadCheckIn, saveAndExplain, type CheckInData } from './connect'
import { useCheckInWhy } from './useCheckInWhy'

export interface CheckInConnectedProps extends Pick<CheckInScreenProps, 'onDone' | 'onEmergency' | 'onWhy' | 'onNoteForEarth'> {
  /** The database Today API (dexieTodayApi): gives the name, the mission day and the personal bands. */
  todayApi: TodayApi
  crewId: string
  /** Omitted = the current mission day. */
  day?: number
  /** mission_config.launch_date, so a new check-in is stamped on the mission calendar. */
  launchDate?: string
  database?: VitalisDB
}

type State = { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ready'; data: CheckInData }

/** Check-in on real data: loads today's check-in and bands, saves with saveCheckIn() and shows what changed. */
export function CheckInConnected({ todayApi, crewId, day, launchDate, database, ...actions }: CheckInConnectedProps) {
  const [attempt, setAttempt] = useState(0)
  const key = `${crewId}@${day ?? 'now'}#${attempt}`
  const [result, setResult] = useState<{ key: string; state: State }>()
  const why = useCheckInWhy(todayApi, crewId, day)

  useEffect(() => {
    let live = true // ignore answers that arrive after the person or day changed
    loadCheckIn(todayApi, crewId, day, { launchDate, database }).then(
      (data) => live && setResult({ key, state: { status: 'ready', data } }),
      (e: unknown) => live && setResult({ key, state: { status: 'error', error: e instanceof Error ? e : new Error(String(e)) } }),
    )
    return () => {
      live = false
    }
  }, [todayApi, crewId, day, launchDate, database, key])

  const state: State = result?.key === key ? result.state : { status: 'loading' }

  if (state.status !== 'ready') {
    return (
      <section className={`${t.root} ${s.page}`} aria-busy={state.status === 'loading'}>
        <div className={t.empty} role={state.status === 'error' ? 'alert' : 'status'}>
          {state.status === 'loading' ? (
            <p>Loading the check-in…</p>
          ) : (
            <>
              <p>Could not load the check-in. {state.error.message}</p>
              <button type="button" className={t.ghostBtn} onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </button>
            </>
          )}
        </div>
      </section>
    )
  }

  const { data } = state
  return (
    <>
      <CheckInScreen
        key={key}
        name={data.name}
        day={data.day}
        existing={data.existing}
        usual={data.usual}
        onSave={(answers) => saveAndExplain(crewId, data, answers, database)}
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
