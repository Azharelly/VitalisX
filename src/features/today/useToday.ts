import { useEffect, useState } from 'react'
import type { TodayApi } from './api.ts'
import type { TodayView } from './model.ts'

export type TodayState =
  | { status: 'loading' }
  | { status: 'error'; error: Error; retry: () => void }
  | { status: 'ready'; data: TodayView; refresh: () => void }

/** Loads the Today view for one crew member and mission day. Pass a stable `api` (module-level or memoised). */
export function useToday(api: TodayApi, crewId: string, day?: number): TodayState {
  const [attempt, setAttempt] = useState(0)
  const key = `${crewId}@${day ?? 'now'}#${attempt}`
  const [result, setResult] = useState<{ key: string; data?: TodayView; error?: Error }>()

  useEffect(() => {
    let live = true // ignore answers that arrive after the person or day changed
    api.getToday(crewId, day).then(
      (data) => live && setResult({ key, data }),
      (e: unknown) => live && setResult({ key, error: e instanceof Error ? e : new Error(String(e)) }),
    )
    return () => {
      live = false
    }
  }, [api, crewId, day, key])

  const again = () => setAttempt((n) => n + 1)
  if (!result || result.key !== key) return { status: 'loading' }
  if (result.error) return { status: 'error', error: result.error, retry: again }
  return { status: 'ready', data: result.data!, refresh: again }
}
