export type TabId = 'crew' | 'today' | 'checkin' | 'radiation' | 'report'

/** The five tabs from the PRD, in order. */
export const TABS: { id: TabId; label: string }[] = [
  { id: 'crew', label: 'Crew' },
  { id: 'today', label: 'Today' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'radiation', label: 'Radiation' },
  { id: 'report', label: 'Report' },
]

// The open tab lives in the URL hash (#today), so refresh, deep links and the browser Back button all work.
export const readTab = (): TabId => {
  const h = window.location.hash.slice(1)
  return TABS.some((x) => x.id === h) ? (h as TabId) : 'crew'
}

/** Pages reached from the header rather than the tab bar. */
export type PageId = TabId | 'messages' | 'sources'
export const readPage = (): PageId => {
  const h = window.location.hash.slice(1)
  return h === 'messages' || h === 'sources' ? h : readTab()
}

export const onHashChange = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
