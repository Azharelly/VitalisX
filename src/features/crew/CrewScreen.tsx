import { useState } from 'react'
import { LEVEL_WORD, ZONES, formatValue, type Level } from '../today/model.ts'
import { StatusIcon } from '../today/StatusIcon'
import { ZoneIcon } from '../today/ZoneIcon'
import t from '../today/today.module.css'
import { Avatar } from './Avatar'
import c from './crew.module.css'
import { AddMemberDialog, RemoveMemberDialog } from './dialogs'
import { checkInText, isPrivateZone, summarize, type CrewCard } from './model.ts'
import { useCrew } from './useCrew.ts'

export interface CrewActions {
  /** Open one person's Today page (the person is already selected when this fires). */
  onOpenPerson?: (crewId: string) => void
}

function LevelTag({ level }: { level: Level }) {
  return (
    <span className={`${c.level} ${t[level]}`}>
      <StatusIcon level={level} />
      {LEVEL_WORD[level]}
    </span>
  )
}

/** The Crew tab: summary strip, needs attention, a zone grid per person, add and remove. */
export function CrewScreen({ onOpenPerson }: CrewActions) {
  const { board, select, addMember, removeMember } = useCrew()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<CrewCard>()

  if (board.status === 'loading') {
    return (
      <section className={t.root} aria-busy="true" aria-label="Loading the crew board">
        <div className={t.skeletonBanner} />
        <div className={t.skeletonCard} />
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
  const sum = summarize(members)
  const open = (id: string) => {
    select(id)
    onOpenPerson?.(id)
  }
  const items = members
    .flatMap((m) => m.attention.map((r) => ({ m, r })))
    .sort((a, b) => (a.r.level === b.r.level ? a.r.priority - b.r.priority : a.r.level === 'alert' ? -1 : 1))

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
          <ul className={c.strip} aria-label="Crew summary">
            {(['alert', 'watch', 'ok', 'learn', 'none'] as const)
              .filter((l) => sum[l] > 0 || l === 'alert' || l === 'watch')
              .map((l) => (
                <li key={l} className={`${c.stat} ${t[l]}`}>
                  <span className={c.statNum}>{sum[l]}</span>
                  <LevelTag level={l} />
                </li>
              ))}
            <li className={c.stat}>
              <span className={c.statNum}>
                {sum.checkedIn}
                <span className={t.muted}>/{members.length}</span>
              </span>
              <span className={t.muted}>checked in today</span>
            </li>
          </ul>

          <section aria-labelledby="crew-attention" className={c.block}>
            <h2 id="crew-attention" className={t.h2}>
              Needs attention <span className={t.count}>{items.length}</span>
            </h2>
            {items.length === 0 ? (
              <div className={t.empty}>Nothing needs attention. Every shared reading is in its usual range.</div>
            ) : (
              <ul className={c.attention}>
                {items.map(({ m, r }) => (
                  <li key={`${m.id}:${r.id}`}>
                    <button type="button" className={`${c.attnRow} ${t[r.level]}`} onClick={() => open(m.id)}>
                      <Avatar initials={m.initials} status={m.status} small />
                      <span className={c.attnText}>
                        <strong>{m.name}</strong>
                        <span className={t.muted}>
                          {r.label} · {formatValue(r)}
                          {r.unit.startsWith('/') ? '' : ' '}
                          {r.unit}
                        </span>
                      </span>
                      <LevelTag level={r.level} />
                      <span className={c.attnGo} aria-hidden="true">
                        →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="crew-zones" className={`${t.weekWrap} ${c.block}`}>
            <h2 id="crew-zones" className={t.h2}>
              Zones by person
            </h2>
            <div className={t.weekScroll}>
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
                        <button type="button" className={c.person} onClick={() => open(m.id)} aria-label={`Open ${m.name}'s Today page`}>
                          <Avatar initials={m.initials} status={m.status} small />
                          <span className={c.personText}>
                            <strong>{m.name}</strong>
                            <span className={t.muted}>{[m.role, checkInText(m, missionDay)].filter(Boolean).join(' · ')}</span>
                          </span>
                        </button>
                      </th>
                      {ZONES.map((z) => (
                        <td key={z.id}>
                          {isPrivateZone(z.id) ? (
                            <span className={c.private}>Private</span>
                          ) : (
                            <LevelTag level={m.zones[z.id] ?? 'none'} />
                          )}
                        </td>
                      ))}
                      <td>
                        <button type="button" className={c.removeBtn} onClick={() => setRemoving(m)} aria-label={`Remove ${m.name}`}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={t.fine}>Mind & sleep stays private to each person and is not part of their crew status.</p>
          </section>
        </>
      )}

      {adding && <AddMemberDialog currentNames={members.map((m) => m.name)} onAdd={addMember} onClose={() => setAdding(false)} />}
      {removing && <RemoveMemberDialog name={removing.name} onRemove={() => removeMember(removing.id)} onClose={() => setRemoving(undefined)} />}
    </section>
  )
}
