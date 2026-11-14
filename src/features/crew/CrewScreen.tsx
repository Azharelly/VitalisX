import { useState, type CSSProperties } from 'react'
import { LEVEL_WORD, ZONES, formatValue, type Level, type Reading } from '../today/model.ts'
import { StatusIcon } from '../today/StatusIcon'
import { ZoneIcon } from '../today/ZoneIcon'
import t from '../today/today.module.css'
import { Avatar } from './Avatar'
import c from './crew.module.css'
import { AddMemberDialog, RemoveMemberDialog } from './dialogs'
import { checkInText, summarize, type CrewCard } from './model.ts'
import { useCrew } from './useCrew.ts'

export interface CrewActions {
  /** Open one person's Today page (the person is already selected when this fires). */
  onOpenPerson?: (crewId: string) => void
}

const ORDER: Level[] = ['alert', 'watch', 'ok', 'learn', 'none']
const valueText = (r: Reading) => `${formatValue(r)}${r.unit.startsWith('/') ? '' : ' '}${r.unit}`

function LevelTag({ level }: { level: Level }) {
  return (
    <span className={`${c.level} ${t[level]}`}>
      <StatusIcon level={level} />
      {LEVEL_WORD[level]}
    </span>
  )
}

/** The Crew tab: overview, needs attention, one card per person (or the zone grid), add and remove. */
export function CrewScreen({ onOpenPerson }: CrewActions) {
  const { board, selected, select, addMember, removeMember } = useCrew()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<CrewCard>()
  const [view, setView] = useState<'cards' | 'grid'>('cards')

  if (board.status === 'loading') {
    return (
      <section className={`${t.root} ${c.page}`} aria-busy="true" aria-label="Loading the crew board">
        <div className={t.skeletonBanner} />
        <div className={c.people}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={t.skeletonCard} />
          ))}
        </div>
      </section>
    )
  }
  if (board.status === 'error') {
    return (
      <section className={t.root}>
        <div className={t.errorBox} role="alert">
          <p className={t.errorTitle}>Could not load the crew board</p>
          <p className={t.muted}>{board.error.message}</p>
          <button type="button" className={t.why} onClick={board.retry}>
            Try again
          </button>
        </div>
      </section>
    )
  }

  const { members, missionDay, isSimulated } = board.board
  const open = (id: string) => {
    select(id)
    onOpenPerson?.(id)
  }

  return (
    <section className={`${t.root} ${c.page}`} aria-labelledby="crew-title">
      <header className={c.head}>
        <div>
          <span className={t.eyebrow}>
            Mission day {missionDay}
            {isSimulated && <span className={c.simInline}>Simulated data</span>}
          </span>
          <h1 id="crew-title" className={c.title}>
            Crew board
          </h1>
        </div>
        <button type="button" className={t.primaryBtn} onClick={() => setAdding(true)}>
          + Add crew member
        </button>
      </header>

      {members.length === 0 ? (
        <div className={t.empty}>
          <p>No crew members yet.</p>
          <p>Add the first person to start their check-ins.</p>
        </div>
      ) : (
        <>
          <div className={c.bento}>
            <Overview members={members} />
            <Attention members={members} onOpen={open} />
          </div>

          <section aria-labelledby="crew-people" className={c.block}>
            <div className={c.sectionHead}>
              <h2 id="crew-people" className={t.h2}>
                Crew <span className={t.count}>{members.length}</span>
              </h2>
              <div className={c.toggle} role="group" aria-label="Layout">
                <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
                  Cards
                </button>
                <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
                  Zone grid
                </button>
              </div>
            </div>
            {view === 'cards' ? (
              <ul className={c.people}>
                {members.map((m, i) => (
                  <PersonCard
                    key={m.id}
                    m={m}
                    i={i}
                    day={missionDay}
                    viewing={m.id === selected?.id}
                    onOpen={() => open(m.id)}
                    onRemove={() => setRemoving(m)}
                  />
                ))}
              </ul>
            ) : (
              <ZoneGrid members={members} day={missionDay} onOpen={open} onRemove={setRemoving} />
            )}
          </section>
        </>
      )}

      {adding && <AddMemberDialog currentNames={members.map((m) => m.name)} onAdd={addMember} onClose={() => setAdding(false)} />}
      {removing && <RemoveMemberDialog name={removing.name} onRemove={() => removeMember(removing.id)} onClose={() => setRemoving(undefined)} />}
    </section>
  )
}

/** Crew status at a glance: a ring split by state, the counts, and today's check-ins. */
function Overview({ members }: { members: CrewCard[] }) {
  const sum = summarize(members)
  const flagged = sum.alert + sum.watch
  const R = 52
  const C = 2 * Math.PI * R
  const shown = ORDER.filter((l) => sum[l] > 0)
  const arcs = shown.map((l, i) => ({
    l,
    len: (sum[l] / members.length) * C,
    offset: (shown.slice(0, i).reduce((n, p) => n + sum[p], 0) / members.length) * C, // where this state's arc starts
  }))

  return (
    <section className={`${c.panel} ${c.overview} ${t[flagged ? (sum.alert ? 'alert' : 'watch') : 'ok']}`} aria-labelledby="crew-overview">
      <h2 id="crew-overview" className={t.srOnly}>
        Crew status
      </h2>
      <div className={c.donutWrap}>
        <svg viewBox="0 0 128 128" className={c.donut} aria-hidden="true">
          <circle cx="64" cy="64" r={R} className={c.donutTrack} />
          {arcs.map((a) => (
            <circle
              key={a.l}
              cx="64"
              cy="64"
              r={R}
              className={`${c.donutArc} ${t[a.l]}`}
              strokeDasharray={`${Math.max(a.len - 4, 1)} ${C}`}
              strokeDashoffset={-a.offset - 2}
            />
          ))}
        </svg>
        <span className={c.donutText}>
          <strong>{members.length}</strong>
          crew
        </span>
      </div>
      <div className={c.overviewText}>
        <p className={c.overviewTitle}>
          {flagged === 0 ? 'Everyone is in their usual range' : `${flagged} of ${members.length} need${flagged === 1 ? 's' : ''} attention`}
        </p>
        <ul className={c.legend}>
          {ORDER.filter((l) => sum[l] > 0 || l === 'alert' || l === 'watch').map((l) => (
            <li key={l}>
              <LevelTag level={l} />
              <span className={c.legendNum}>{sum[l]}</span>
            </li>
          ))}
        </ul>
        <div className={c.checkins}>
          <span>
            <strong>{sum.checkedIn}</strong>/{members.length} checked in today
          </span>
          <span className={c.progress} aria-hidden="true">
            <span style={{ width: `${(sum.checkedIn / members.length) * 100}%` }} />
          </span>
        </div>
      </div>
    </section>
  )
}

/** Every Watch / Alert reading, grouped by person, Alert first. */
function Attention({ members, onOpen }: { members: CrewCard[]; onOpen: (id: string) => void }) {
  const people = members
    .filter((m) => m.attention.length)
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
  const total = people.reduce((n, m) => n + m.attention.length, 0)

  return (
    <section className={`${c.panel} ${c.attentionPanel}`} aria-labelledby="crew-attention">
      <h2 id="crew-attention" className={t.h2}>
        Needs attention <span className={t.count}>{total}</span>
      </h2>
      {people.length === 0 ? (
        <p className={c.allClear}>
          <StatusIcon level="ok" /> Nothing needs attention. Every shared reading is in its usual range.
        </p>
      ) : (
        <ul className={c.attention}>
          {people.map((m) => (
            <li key={m.id}>
              <button type="button" className={`${c.attnRow} ${t[m.status]}`} onClick={() => onOpen(m.id)} aria-label={`Open ${m.name}'s Today page`}>
                <Avatar initials={m.initials} status={m.status} small />
                <span className={c.attnText}>
                  <strong>{m.name}</strong>
                  <span className={c.attnItems}>
                    {m.attention.map((r) => (
                      <span key={r.id} className={`${c.chip} ${t[r.level]}`}>
                        <StatusIcon level={r.level} />
                        {r.label} <span className={c.chipValue}>{valueText(r)}</span>
                      </span>
                    ))}
                  </span>
                </span>
                <span className={c.attnGo} aria-hidden="true">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface CardProps {
  m: CrewCard
  i: number
  day: number
  viewing: boolean
  onOpen: () => void
  onRemove: () => void
}

/** One person: ring, state, check-in, the most urgent reading and their zones. */
function PersonCard({ m, i, day, viewing, onOpen, onRemove }: CardProps) {
  const top = m.attention[0]
  const quiet =
    m.status === 'none' ? 'Waiting for the first check-in' : m.status === 'learn' ? 'Learning their normal' : 'Shared readings in usual range'
  const due = !m.checkIn.doneAt

  return (
    <li className={`${c.person} ${t[m.status]} ${m.status === 'alert' || m.status === 'watch' ? c.flagged : ''} ${viewing ? c.viewing : ''}`} style={{ '--i': i } as CSSProperties}>
      <div className={c.personHead}>
        <Avatar initials={m.initials} status={m.status} />
        <div className={c.personName}>
          <h3>{m.name}</h3>
          <span className={t.muted}>{m.role || 'Crew'}</span>
        </div>
        <span className={`${t.pill} ${c.statePill}`}>
          <StatusIcon level={m.status} />
          {LEVEL_WORD[m.status]}
        </span>
      </div>

      <p className={`${c.checkLine} ${due ? c.checkDue : ''}`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 4.5V8l2.5 1.5" />
        </svg>
        {checkInText(m, day)}
        {viewing && <span className={c.viewingTag}>Viewing</span>}
      </p>

      <div className={`${c.topItem} ${t[top?.level ?? m.status]}`}>
        {top ? (
          <>
            <span className={c.topLabel}>
              {top.label}
              {m.attention.length > 1 && <span className={t.muted}> · +{m.attention.length - 1} more</span>}
            </span>
            <span className={c.topValue}>
              {valueText(top)} <LevelTag level={top.level} />
            </span>
          </>
        ) : (
          <span className={c.topLabel}>
            <StatusIcon level={m.status} /> {quiet}
          </span>
        )}
      </div>

      <ul className={c.zones} aria-label={`${m.name}'s zones`}>
        {ZONES.map((z) => {
          const level = m.zones[z.id] ?? 'none'
          return (
            <li key={z.id} className={`${c.zone} ${t[level]}`} title={`${z.label}: ${LEVEL_WORD[level]}`}>
              <ZoneIcon zone={z.id} className={c.zoneIcon} />
              <StatusIcon level={level} />
              <span className={t.srOnly}>
                {z.label}: {LEVEL_WORD[level]}
              </span>
            </li>
          )
        })}
      </ul>

      <div className={c.personFoot}>
        <button type="button" className={c.openBtn} onClick={onOpen}>
          Open profile <span aria-hidden="true">→</span>
        </button>
        <button type="button" className={c.removeBtn} onClick={onRemove} aria-label={`Remove ${m.name}`}>
          Remove
        </button>
      </div>
    </li>
  )
}

/** The per-person zone matrix: every zone as shape + word, for scanning the whole crew at once. */
function ZoneGrid({ members, day, onOpen, onRemove }: { members: CrewCard[]; day: number; onOpen: (id: string) => void; onRemove: (m: CrewCard) => void }) {
  return (
    <div className={`${t.weekWrap} ${t.weekScroll}`}>
      <table className={`${t.week} ${c.matrix}`}>
        <thead>
          <tr>
            <th scope="col">Person</th>
            {ZONES.map((z) => (
              <th key={z.id} scope="col">
                <ZoneIcon zone={z.id} className={t.tileIcon} />
                <span className={c.zoneHead}>{z.label}</span>
              </th>
            ))}
            <th scope="col">
              <span className={t.srOnly}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <th scope="row">
                <button type="button" className={c.personBtn} onClick={() => onOpen(m.id)} aria-label={`Open ${m.name}'s Today page`}>
                  <Avatar initials={m.initials} status={m.status} small />
                  <span className={c.personText}>
                    <strong>{m.name}</strong>
                    <span className={t.muted}>{[m.role, checkInText(m, day)].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              </th>
              {ZONES.map((z) => (
                <td key={z.id}>
                  <LevelTag level={m.zones[z.id] ?? 'none'} />
                </td>
              ))}
              <td>
                <button type="button" className={c.removeBtn} onClick={() => onRemove(m)} aria-label={`Remove ${m.name}`}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
