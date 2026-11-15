import { useEffect, useState } from 'react'
import type { OutboxMessage, OutboxPort } from '../../data/outbox'

/** Every crew member's messages to Earth, newest first. Reads the outbox per person (the port has no "list all"). */
export function useEarthMessages(outbox: OutboxPort | undefined, crewIds: string[]) {
  const [messages, setMessages] = useState<OutboxMessage[]>([])
  const [loadedAt, setLoadedAt] = useState(0) // when the list was read: lets callers judge "on its way" without reading the clock in render
  const [error, setError] = useState<string>()
  const [tick, setTick] = useState(0)
  const key = crewIds.join(',')

  useEffect(() => {
    if (!outbox) return
    let live = true
    const ids = key.split(',').filter(Boolean)
    const load = () =>
      Promise.all(ids.map((id) => outbox.list(id))).then(
        (lists) => {
          if (!live) return
          setMessages(lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id))
          setLoadedAt(Date.now())
          setError(undefined)
        },
        (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
      )
    void load()
    // shortcut: polls every 3 s to pick up messages queued elsewhere (Report, Emergency); switch to Dexie liveQuery if it ever matters.
    const id = window.setInterval(load, 3000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [outbox, key, tick])

  return { messages, loadedAt, error, reload: () => setTick((n) => n + 1) }
}
