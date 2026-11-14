import type { TodayApi } from './api.ts'
import { TodayScreen, type TodayActions } from './TodayScreen'
import { useToday } from './useToday.ts'
import s from './today.module.css'

interface Props extends TodayActions {
  api: TodayApi
  crewId: string
  day?: number // mission day; omitted = current day from the data source
}

/** Connected Today screen: fetches through the TodayApi contract and handles loading and error states. */
export function Today({ api, crewId, day, ...actions }: Props) {
  const state = useToday(api, crewId, day)

  if (state.status === 'loading') {
    return (
      <section className={s.root} aria-busy="true" aria-label="Loading today's health data">
        <div className={s.skeletonBanner} />
        <div className={s.layout}>
          <div className={s.skeletonBody} />
          <div className={s.right}>
            <div className={s.skeletonCard} />
            <div className={s.skeletonCard} />
          </div>
        </div>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className={s.root}>
        <div className={s.errorBox} role="alert">
          <p className={s.errorTitle}>Could not load today's data</p>
          <p className={s.muted}>{state.error.message}</p>
          <button type="button" className={s.why} onClick={state.retry}>
            Try again
          </button>
        </div>
      </section>
    )
  }

  return <TodayScreen data={state.data} {...actions} />
}
