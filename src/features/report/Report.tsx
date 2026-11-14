import { useEffect, useState } from 'react'
import type { TodayApi } from '../today/api.ts'
import type { ReportView } from '../today/model.ts'
import { ReportScreen, type ReportActions } from './ReportScreen'
import s from './report.module.css'

interface Props extends Omit<ReportActions, 'onPeriodChange'> {
  api: TodayApi
  crewId: string
  day?: number // last day of the period; omitted = current mission day
  initialDays?: 7 | 28
}

/** Connected Report page: fetches GET /crew/:id/report through the TodayApi contract; owns the Week/Month toggle. */
export function Report({ api, crewId, day, initialDays = 7, ...actions }: Props) {
  const [days, setDays] = useState<7 | 28>(initialDays)
  const [attempt, setAttempt] = useState(0)
  const key = `${crewId}@${day ?? 'now'}/${days}#${attempt}`
  const [result, setResult] = useState<{ key: string; data?: ReportView; error?: Error }>()

  useEffect(() => {
    let live = true // ignore answers that arrive after the person, day or period changed
    api.getReport(crewId, { day, days }).then(
      (data) => live && setResult({ key, data }),
      (e: unknown) => live && setResult({ key, error: e instanceof Error ? e : new Error(String(e)) }),
    )
    return () => {
      live = false
    }
  }, [api, crewId, day, days, key])

  if (!result || result.key !== key) {
    return (
      <section className={s.root} aria-busy="true" aria-label="Loading report">
        <div className={s.skeleton} style={{ height: 120 }} />
        <div className={s.skeleton} style={{ height: 320 }} />
        <div className={s.skeleton} style={{ height: 420 }} />
      </section>
    )
  }
  if (result.error) {
    return (
      <section className={s.root}>
        <div className={s.errorBox} role="alert">
          <p className={s.h2}>Could not load the report</p>
          <p className={s.muted}>{result.error.message}</p>
          <button type="button" className={s.why} onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      </section>
    )
  }
  return <ReportScreen report={result.data!} onPeriodChange={setDays} {...actions} />
}
