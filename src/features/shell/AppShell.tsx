import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { AvatarRow } from '../crew/AvatarRow'
import { CrewProvider } from '../crew/CrewProvider'
import { CrewScreen } from '../crew/CrewScreen'
import { AddMemberDialog } from '../crew/dialogs'
import { useCrew } from '../crew/useCrew.ts'
import type { CrewApi } from '../crew/api.ts'
import { Report } from '../report/Report'
import type { ReportOutbox } from '../report/ReportScreen'
import type { TodayApi } from '../today/api.ts'
import { LEVEL_WORD, isFlagged } from '../today/model.ts'
import { StatusIcon } from '../today/StatusIcon'
import { Today } from '../today/Today'
import t from '../today/today.module.css'
import s from './shell.module.css'
import { TABS, onHashChange, readTab, type TabId } from './tabs.ts'

/** A teammate's screen. It receives the chosen person and mission day, and can switch tabs. */
export type ScreenSlot = (ctx: { crewId: string; day?: number; go: (tab: TabId) => void }) => ReactNode

export interface AppShellProps extends ReportOutbox {
  crewApi: CrewApi
  todayApi: TodayApi
  /** Mission day to show; omitted = today (the data source decides). */
  day?: number
  /** Screens owned by teammates. A missing slot shows a short "being built" note instead of a blank page. */
  screens?: Partial<Record<'checkin' | 'radiation', ScreenSlot>>
  /** Opens the emergency flow (F-08). Gets the person on screen, if any. */
  onEmergency?: (crewId?: string) => void
  onWhy?: (metricId: string) => void
  onStart?: (crewId: string, metricId: string) => void
  onNoteForEarth?: (crewId: string, metricId?: string) => void
  onSendSummary?: (crewId: string, days: number) => void
  /** Demo controls (AppPreview only), shown in the header next to the brand so they never cover the page. */
  demo?: ReactNode
}

/**
 * The app frame: one sticky header (mission day, crew avatars, Emergency) and the five tabs,
 * in the header on wide screens and as a bottom bar on phones and tablets.
 * Owns the shared crew state, so choosing an avatar switches the person on every tab.
 */
export function AppShell({ crewApi, day, ...rest }: AppShellProps) {
  return (
    <CrewProvider api={crewApi} day={day}>
      <Frame day={day} {...rest} />
    </CrewProvider>
  )
}

const CONTENT_ID = 'vx-content'

function Frame({ todayApi, day, screens = {}, onEmergency, onWhy, onStart, onNoteForEarth, onSendSummary, outbox, send, commsDelaySec, demo }: Omit<AppShellProps, 'crewApi'>) {
  const { board, selected, addMember } = useCrew()
  const tab = useSyncExternalStore(onHashChange, readTab, () => 'crew' as TabId)
  const [adding, setAdding] = useState(false)
  const focusContent = () => document.getElementById(CONTENT_ID)?.focus({ preventScroll: true })
  const go = (next: TabId) => {
    if (next !== tab) window.location.assign(`#${next}`)
    window.scrollTo({ top: 0 })
    focusContent() // screen readers land on the new page, not on the tab bar
  }

  const members = board.status === 'ready' ? board.board.members : []
  const missionDay = board.status === 'ready' ? board.board.missionDay : day
  const needAttention = members.filter((m) => isFlagged(m.status)).length
  const id = selected?.id

  const tabs = (
    <ul className={s.tabList}>
      {TABS.map((x) => (
        <li key={x.id}>
          <button type="button" className={s.tab} aria-current={tab === x.id ? 'page' : undefined} onClick={() => go(x.id)}>
            <span className={s.tabIcon}>
              <TabIcon id={x.id} />
            </span>
            {x.label}
            {x.id === 'crew' && needAttention > 0 && (
              <span className={s.count} aria-hidden="true">
                {needAttention}
              </span>
            )}
            {x.id === 'today' && selected && isFlagged(selected.status) && (
              <span className={`${s.mark} ${t[selected.status]}`}>
                <StatusIcon level={selected.status} />
              </span>
            )}
            {x.id === 'crew' && needAttention > 0 && <span className={t.srOnly}>, {needAttention} need attention</span>}
            {x.id === 'today' && selected && isFlagged(selected.status) && <span className={t.srOnly}>, {LEVEL_WORD[selected.status]}</span>}
          </button>
        </li>
      ))}
    </ul>
  )

  const needsPerson = (node: ReactNode) =>
    id ? (
      node
    ) : (
      <Note title="No crew member yet" text="Add someone on the Crew tab to see their pages." action={{ label: 'Go to Crew', onClick: () => go('crew') }} />
    )
  const slot = (key: 'checkin' | 'radiation', label: string) => {
    const render = screens[key]
    return needsPerson(render ? render({ crewId: id!, day, go }) : <Note title={label} text="This screen is being built by the team." />)
  }

  return (
    <div className={`${t.theme} ${s.app}`}>
      <a
        className={s.skip}
        href={`#${CONTENT_ID}`}
        onClick={(e) => {
          e.preventDefault() // the hash holds the open tab, so move focus instead of navigating
          focusContent()
        }}
      >
        Skip to content
      </a>
      <header className={s.header}>
        <div className={s.topRow}>
          <div className={s.brand}>
            <span className={s.logo} aria-hidden="true" />
            <span className={s.brandText}>
              <strong>VitalisX</strong>
              {missionDay !== undefined && <span>Day {missionDay}</span>}
            </span>
            {demo}
          </div>
          <nav className={s.navWide} aria-label="Main">
            {tabs}
          </nav>
          <button type="button" className={s.emergency} onClick={() => onEmergency?.(id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 22 20H2ZM12 10v4M12 17v.5" />
            </svg>
            <span>Emergency</span>
          </button>
        </div>
        <div className={s.crewRow}>
          <AvatarRow onAdd={() => setAdding(true)} />
        </div>
      </header>

      <main id={CONTENT_ID} tabIndex={-1} className={s.content}>
        {tab === 'crew' && <CrewScreen onOpenPerson={() => go('today')} />}
        {tab === 'today' &&
          needsPerson(
            <Today
              api={todayApi}
              crewId={id!}
              day={day}
              onWhy={onWhy}
              onStart={onStart}
              onNoteForEarth={onNoteForEarth}
              onStartCheckIn={() => go('checkin')}
              onOpenReport={() => go('report')}
            />,
          )}
        {tab === 'report' && needsPerson(<Report key={id} api={todayApi} crewId={id!} day={day} onSendSummary={onSendSummary} onWhy={onWhy} outbox={outbox} send={send} commsDelaySec={commsDelaySec} />)}
        {tab === 'checkin' && slot('checkin', 'Check-in')}
        {tab === 'radiation' && slot('radiation', 'Radiation')}
      </main>

      <nav className={s.navBottom} aria-label="Main">
        {tabs}
      </nav>

      {adding && <AddMemberDialog currentNames={members.map((m) => m.name)} onAdd={addMember} onClose={() => setAdding(false)} />}
    </div>
  )
}

function Note({ title, text, action }: { title: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <section className={`${t.root} ${s.note}`}>
      <div className={t.empty}>
        <p className={s.noteTitle}>{title}</p>
        <p>{text}</p>
        {action && (
          <button type="button" className={t.ghostBtn} onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </section>
  )
}

const ICONS: Record<TabId, ReactNode> = {
  crew: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16.5 14c2.4.2 4 1.7 4.5 4.2" />
    </>
  ),
  today: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  checkin: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2.5" />
      <path d="M9 4h6v3H9zM8.5 13.5l2.5 2.5 4.5-5" />
    </>
  ),
  radiation: (
    <>
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 9.5 9.6 5.3a7.5 7.5 0 0 1 4.8 0zM14.2 13.3l4.8.1a7.5 7.5 0 0 1-2.4 4.2zM9.8 13.3l-2.4 4.3A7.5 7.5 0 0 1 5 13.4z" />
    </>
  ),
  report: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
}

function TabIcon({ id }: { id: TabId }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[id]}
    </svg>
  )
}
