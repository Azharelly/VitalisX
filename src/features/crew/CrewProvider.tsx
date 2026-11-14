import { useEffect, useState, type ReactNode } from 'react'
import type { CrewApi } from './api.ts'
import type { CrewBoard } from './model.ts'
import { CrewContext, type CrewBoardState } from './useCrew.ts'

interface Props {
  api: CrewApi // pass a stable object (module-level or memoised)
  day?: number // mission day; omitted = current day from the data source
  children: ReactNode
}

/**
 * Holds the crew board and the chosen person for the whole app.
 * Wrap the app once; the avatar row, Crew, Today and Report all read the same `selected` person.
 */
export function CrewProvider({ api, day, children }: Props) {
  const [chosenId, setChosenId] = useState<string>()
  const [version, setVersion] = useState(0) // bumped after add / remove to reload the board
  const key = `${day ?? 'now'}#${version}`
  const [result, setResult] = useState<{ key: string; board?: CrewBoard; error?: Error }>()

  useEffect(() => {
    let live = true
    api.getBoard(day).then(
      (board) => live && setResult({ key, board }),
      (e: unknown) => live && setResult({ key, error: e instanceof Error ? e : new Error(String(e)) }),
    )
    return () => {
      live = false
    }
  }, [api, day, key])

  // While reloading, keep showing the last board so the page does not flash.
  const board: CrewBoardState = result?.board
    ? { status: 'ready', board: result.board }
    : result?.error && result.key === key
      ? { status: 'error', error: result.error, retry: () => setVersion((v) => v + 1) }
      : { status: 'loading' }
  const members = board.status === 'ready' ? board.board.members : []

  return (
    <CrewContext.Provider
      value={{
        board,
        selected: members.find((m) => m.id === chosenId) ?? members[0],
        select: setChosenId,
        addMember: async (m) => {
          const added = await api.addMember(m)
          setChosenId(added.id)
          setVersion((v) => v + 1)
          return added
        },
        removeMember: async (crewId) => {
          await api.removeMember(crewId)
          setVersion((v) => v + 1)
        },
      }}
    >
      {children}
    </CrewContext.Provider>
  )
}
