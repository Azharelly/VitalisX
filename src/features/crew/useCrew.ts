import { createContext, useContext } from 'react'
import type { CrewSummary } from '../today/api.ts'
import type { CrewBoard, CrewCard, NewMember } from './model.ts'

export type CrewBoardState =
  | { status: 'loading' }
  | { status: 'error'; error: Error; retry: () => void }
  | { status: 'ready'; board: CrewBoard }

export interface CrewContextValue {
  board: CrewBoardState
  /** The person every tab shows. Falls back to the first member when nobody is chosen or they were removed. */
  selected: CrewCard | undefined
  select: (crewId: string) => void
  addMember: (m: NewMember) => Promise<CrewSummary>
  removeMember: (crewId: string) => Promise<void>
}

export const CrewContext = createContext<CrewContextValue | null>(null)

/** Read the shared crew state. Any tab: `const { selected } = useCrew()` then show `selected.id`. */
export function useCrew(): CrewContextValue {
  const value = useContext(CrewContext)
  if (!value) throw new Error('useCrew must be used inside <CrewProvider>')
  return value
}
