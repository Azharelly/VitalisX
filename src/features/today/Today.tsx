import type { TodayApi } from './api.ts'
import { TodayScreen, type TodayActions } from './TodayScreen'
import { useToday } from './useToday.ts'
import ui from './shared.module.css'
import s from './today.module.css'

interface Props extends TodayActions {
  api: TodayApi
  crewId: string
  day?: number // mission day; omitted = current day from the data source
}

/** Connected Today page: fetches through the TodayApi contract and handles loading and error states. */
export function Today({ api, crewId, day, ...actions }: Props) {
  const state = useToday(api, crewId, day)

  if (state.status === 'loading') {
    return (
      <section className={`${ui.root} ${s.page}`} aria-busy="true" aria-label="Loading today's health data">
        <div className={`${ui.skeleton} ${s.skeletonBanner}`} />
        <div className={s.layout}>
          <div className={`${ui.skeleton} ${s.skeletonBody}`} />
          <div className={s.main}>
            <div className={`${ui.skeleton} ${s.skeletonCard}`} />
            <div className={`${ui.skeleton} ${s.skeletonCard}`} />
          </div>
        </div>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className={`${ui.root} ${s.page}`}>
        <div className={ui.errorBox} role="alert">
          <h1 className={ui.h2}>Today's data could not be loaded</h1>
          <p className={`${ui.small} ${ui.muted}`}>{state.error.message}</p>
          <button type="button" className={ui.btn} onClick={state.retry}>
            Try again
          </button>
        </div>
      </section>
    )
  }

  return <TodayScreen data={state.data} {...actions} />
}
