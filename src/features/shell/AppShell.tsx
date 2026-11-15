import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
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
import { TABS, onHashChange, readPage, type PageId, type TabId } from './tabs.ts'
import { EmergencyProvider, useEmergency, type CrewMemberSummary } from '../emergency/EmergencyProvider'
import { EmergencyScreen } from '../emergency/EmergencyScreen'
import { isMedicRole } from '../emergency/roles'
import { DEFAULT_COMMS_DELAY_SEC, flushOutbox } from '../../data/outbox'
import { MessagesScreen } from '../messages/MessagesScreen'
import { tripOf } from '../messages/model'
import { useEarthMessages } from '../messages/useEarthMessages'

/** A teammate's screen. It receives the chosen person and mission day, and can switch tabs. */
export type ScreenSlot = (ctx: {
  crewId: string
  day?: number
  go: (tab: TabId) => void
  /** Opens the Earth summary on Report (or only emits onNoteForEarth when there is no outbox). */
  noteForEarth: (metricId?: string) => void
  /** Opens the emergency flow for this person ("Get help now"). */
  emergency: () => void
}) => ReactNode

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
  onPersistLog?: (entry: { timestampIso: string; event: string; sessionId: string }) => void
}

/**
 * The app frame: one sticky header (mission day, crew avatars, Emergency) and the five tabs,
 * in the header on wide screens and as a bottom bar on phones and tablets.
 * Owns the shared crew state, so choosing an avatar switches the person on every tab.
 */
export function AppShell({ crewApi, day, ...rest }: AppShellProps) {
  return (
    <CrewProvider api={crewApi} day={day}>
      <EmergencyShell day={day} {...rest} />
    </CrewProvider>
  )
}

const CONTENT_ID = 'vx-content'

function EmergencyShell({ todayApi, day, onPersistLog, ...rest }: Omit<AppShellProps, 'crewApi'>) {
  const { outbox, send } = rest
  // One-way Earth delay in minutes, from mission config (via commsDelaySec); not a number baked into the UI.
  const oneWayDelayMinutes = (rest.commsDelaySec ?? DEFAULT_COMMS_DELAY_SEC) / 60
  const { board } = useCrew()
  const members = useMemo(() => (board.status === 'ready' ? board.board.members : []), [board])
  const [summaries, setSummaries] = useState<CrewMemberSummary[]>([])

  useEffect(() => {
    let live = true
    Promise.all(
      members.map(async (member): Promise<CrewMemberSummary> => {
        const today = await todayApi.getToday(member.id, day)
        const value = (...ids: string[]) => today.readings.find((r) => ids.includes(r.id) && r.value !== null)?.value ?? null
        return {
          ...summaryOf(member),
          today,
          currentHr: value('hr'),
          currentBpSys: value('sys', 'bp_sys'),
          currentBpDia: value('dia', 'bp_dia'),
          currentSpo2: value('spo2'),
        }
      }),
    ).then(
      (next) => {
        if (live) setSummaries(next)
      },
      (error: unknown) => {
        if (live) console.error('Could not load emergency vitals', error)
      },
    )
    return () => {
      live = false
    }
  }, [day, members, todayApi])

  // Until Today data arrives: names and roles only, no vitals (never invented numbers).
  const fallbackSummaries = useMemo(() => members.map(summaryOf), [members])
  const activeSummaries =
    summaries.length === members.length && summaries.every((summary, index) => summary.id === members[index]?.id)
      ? summaries
      : fallbackSummaries

  const missionDay = board.status === 'ready' ? board.board.missionDay : (day ?? 0)
  // Each message to the flight surgeon also goes into the shared outbox, so it shows on the Messages page.
  const sendToEarth = (crewId: string, text: string) => {
    if (!outbox) return
    outbox
      .queue({ crewId, day: missionDay, text, delaySec: rest.commsDelaySec ?? DEFAULT_COMMS_DELAY_SEC })
      .then(() => send && flushOutbox(outbox, crewId, send))
      .catch((error: unknown) => console.error('Could not queue the emergency message', error))
  }

  return (
    <EmergencyProvider crew={activeSummaries} onPersistLog={onPersistLog} oneWayDelayMinutes={oneWayDelayMinutes} onSendToEarth={sendToEarth}>
      <Frame todayApi={todayApi} day={day} {...rest} />
    </EmergencyProvider>
  )
}

const summaryOf = (member: { id: string; name: string; role: string }): CrewMemberSummary => ({
  id: member.id,
  name: member.name,
  role: member.role,
  isMedic: isMedicRole(member.role),
  currentHr: null,
  currentBpSys: null,
  currentBpDia: null,
  currentSpo2: null,
})

function Frame({ todayApi, day, screens = {}, onEmergency, onWhy, onStart, onNoteForEarth, onSendSummary, outbox, send, commsDelaySec, demo }: Omit<AppShellProps, 'crewApi'>) {
  const { board, selected, addMember } = useCrew()
  const { crew, openEmergency, session, elapsedSeconds, oneWayDelayMinutes, isReady: emergencyReady } = useEmergency()
  const tab = useSyncExternalStore(onHashChange, readPage, () => 'crew' as PageId)
  const [adding, setAdding] = useState(false)
  const focusContent = () => document.getElementById(CONTENT_ID)?.focus({ preventScroll: true })
  const go = (next: PageId) => {
    if (next !== tab) window.location.assign(`#${next}`)
    window.scrollTo({ top: 0 })
    focusContent() // screen readers land on the new page, not on the tab bar
  }

  // "Note for Earth" anywhere opens the Earth summary on Report, the one place that writes and queues it.
  const [summaryFor, setSummaryFor] = useState<string>()
  const noteForEarth = (crewId: string, metricId?: string) => {
    onNoteForEarth?.(crewId, metricId)
    if (!outbox) return
    setSummaryFor(crewId)
    go('report')
  }

  const members = board.status === 'ready' ? board.board.members : []
  const earth = useEarthMessages(outbox, members.map((m) => m.id))
  const inFlight = earth.messages.filter((m) => ['waiting', 'travelling'].includes(tripOf(m, earth.loadedAt, commsDelaySec).stage)).length
  const missionDay = board.status === 'ready' ? board.board.missionDay : day
  const needAttention = members.filter((m) => isFlagged(m.status)).length
  const id = selected?.id
  const triggerEmergency = () => {
    openEmergency(id)
    onEmergency?.(id)
  }
  const emergencyLabel =
    session && !session.endedAtIso
      ? `EMERGENCY · ${Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:${(elapsedSeconds % 60).toString().padStart(2, '0')}`
      : 'EMERGENCY'

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
                <span className={s.countNumber}>{needAttention}</span>
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
    return needsPerson(render ? render({ crewId: id!, day, go, noteForEarth: (m) => noteForEarth(id!, m), emergency: triggerEmergency }) : <Note title={label} text="This screen is being built by the team." />)
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
          <button
            type="button"
            className={s.earth}
            aria-current={tab === 'messages' ? 'page' : undefined}
            aria-label={`Messages to Earth${inFlight ? `, ${inFlight} on the way` : ''}`}
            title="Messages to Earth"
            onClick={() => go('messages')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
            </svg>
            {inFlight > 0 && (
              <span className={s.earthCount} aria-hidden="true">
                {inFlight}
              </span>
            )}
          </button>
          <button type="button" className={`${s.emergency} ${session && !session.endedAtIso ? s.emergencyActive : ''}`} onClick={triggerEmergency} disabled={!emergencyReady}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 22 20H2ZM12 10v4M12 17v.5" />
            </svg>
            <span>{emergencyLabel}</span>
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
              onNoteForEarth={noteForEarth}
              onStartCheckIn={() => go('checkin')}
              onOpenReport={() => go('report')}
            />,
          )}
        {tab === 'report' && needsPerson(<Report key={id} api={todayApi} crewId={id!} day={day} onSendSummary={onSendSummary} onWhy={onWhy} outbox={outbox} send={send} commsDelaySec={commsDelaySec} openSummary={summaryFor === id} onSummaryClosed={() => setSummaryFor(undefined)} />)}
        {tab === 'checkin' && slot('checkin', 'Check-in')}
        {tab === 'radiation' && slot('radiation', 'Radiation')}
        {tab === 'messages' && (
          <MessagesScreen
            messages={earth.messages}
            error={earth.error}
            names={Object.fromEntries(members.map((m) => [m.id, m.name]))}
            outbox={outbox}
            send={send}
            commsDelaySec={commsDelaySec}
            day={missionDay ?? 0}
            onChanged={earth.reload}
          />
        )}
      </main>

      <EmergencyScreen crew={crew} oneWayDelayMinutes={oneWayDelayMinutes} />
      <nav className={s.navBottom} aria-label="Main">
        {tabs}
        <div className={s.navExtra}>
          <button type="button" className={`${s.emergencyNavButton} ${session && !session.endedAtIso ? s.emergencyActive : ''}`} onClick={triggerEmergency} disabled={!emergencyReady}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 22 20H2ZM12 10v4M12 17v.5" />
            </svg>
            {emergencyLabel}
          </button>
          {/* Phones and tablets: Messages lives here, the header has no room next to Demo and Emergency. */}
          <button type="button" className={s.messagesNavButton} aria-current={tab === 'messages' ? 'page' : undefined} onClick={() => go('messages')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
            </svg>
            Messages
            {inFlight > 0 && <span className={s.navExtraCount}>{inFlight}</span>}
            {inFlight > 0 && <span className={t.srOnly}>, {inFlight} on the way</span>}
          </button>
        </div>
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
