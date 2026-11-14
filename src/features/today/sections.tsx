import type { CSSProperties } from 'react'
import { actionFor } from '../../data/guidance'
import { RangeBar, Sparkline } from './Charts'
import { GuidancePanel } from './GuidancePanel'
import { StatusBadge, StatusIcon } from './StatusIcon'
import { ZoneIcon } from './ZoneIcon'
import {
  LEVEL_WORD,
  ZONES,
  deviation,
  formatValue,
  headline,
  isFlagged,
  usualText,
  type Level,
  type Reading,
  type TodayView,
  type ZoneId,
} from './model'
import ui from './shared.module.css'
import s from './today.module.css'

// The Today page's sections. Each one is presentational: data in, callbacks out, no fetching.

const zoneLabel = (z: ZoneId) => ZONES.find((x) => x.id === z)!.label
const metaLine = (r: Reading) => [usualText(r) || r.note, r.measured].filter(Boolean).join(' · ')

/* ── Next step ─────────────────────────────────────────────────────────────────── */

interface NextProps {
  data: TodayView
  flagged: Reading[] // all Watch/Alert readings, most urgent first
  onStart?: (metricId: string) => void
  onWhy?: (metricId: string) => void
  onNoteForEarth?: (metricId?: string) => void
  onStartCheckIn?: () => void
}

export function NextStepCard({ data, flagged, onStart, onWhy, onNoteForEarth, onStartCheckIn }: NextProps) {
  const na = data.nextAction
  const target = na.kind === 'metric' ? data.readings.find((r) => r.id === na.metricId) : undefined
  const also = flagged.filter((r) => r.id !== target?.id)
  const first = data.person.name.split(' ')[0]

  if (target) {
    return (
      <article className={`${ui.card} ${s.next} ${s[target.level]}`} aria-labelledby="today-next">
        <div className={s.nextHead}>
          <p className={ui.caption}>Next step</p>
          <StatusBadge level={target.level} label={LEVEL_WORD[target.level]} />
        </div>
        <h2 id="today-next" className={ui.title}>
          {headline(target)}
        </h2>
        <p className={s.nextText}>{actionFor(target.id, target.level)}</p>
        <div className={s.actions}>
          <button type="button" className={ui.btnPrimary} onClick={() => onStart?.(target.id)}>
            Mark as started
          </button>
          <button type="button" className={ui.btn} onClick={() => onWhy?.(target.id)}>
            Why?
          </button>
          <button type="button" className={ui.btn} onClick={() => onNoteForEarth?.(target.id)}>
            Message flight surgeon
          </button>
        </div>
        {also.length > 0 && <p className={`${ui.small} ${ui.muted}`}>Also open: {also.map((r) => r.label).join(', ')}</p>}
        <details className={s.more}>
          <summary>How to handle this</summary>
          <GuidancePanel metricId={target.id} />
        </details>
        <p className={ui.caption}>Decision support, not a diagnosis. Follow mission procedures.</p>
      </article>
    )
  }

  const due = !data.checkIn.doneAt
  const [title, text] =
    na.kind === 'learning'
      ? [`Learning ${first}'s normal`, `${na.checkInsLeft} more check-in${na.checkInsLeft === 1 ? '' : 's'} until readings can be compared with ${first}'s own normal.`]
      : due
        ? ["Today's check-in is due", 'It takes about a minute. Readings are compared with your own normal.']
        : ['Everything is within your usual range', 'Nothing to do right now. Keep following your plan.']

  return (
    <article className={`${ui.card} ${s.next} ${s.ok}`} aria-labelledby="today-next">
      <p className={ui.caption}>Next step</p>
      <h2 id="today-next" className={ui.title}>
        {title}
      </h2>
      <p className={s.nextText}>{text}</p>
      {due && (
        <div className={s.actions}>
          <button type="button" className={ui.btnPrimary} onClick={onStartCheckIn}>
            Start check-in
          </button>
        </div>
      )}
    </article>
  )
}

/* ── Needs attention ──────────────────────────────────────────────────────────── */

export function AttentionCard({ r, onWhy }: { r: Reading; onWhy?: (id: string) => void }) {
  const dev = deviation(r)
  const step = actionFor(r.id, r.level)
  return (
    <article className={`${ui.card} ${s.card} ${s[r.level]}`} aria-label={`${r.label}, ${LEVEL_WORD[r.level]}`}>
      <header className={s.cardHead}>
        <span className={s.iconCircle}>
          <ZoneIcon zone={r.zone} />
        </span>
        <span className={s.cardTitle}>
          <span className={ui.h3}>{r.label}</span>
          <span className={ui.caption}>{[zoneLabel(r.zone), r.context].filter(Boolean).join(' · ')}</span>
        </span>
        <StatusBadge level={r.level} label={LEVEL_WORD[r.level]} />
      </header>

      <div className={s.cardBody}>
        <p className={s.value}>
          {formatValue(r)}
          <span className={ui.unit}>{r.unit}</span>
        </p>
        <Sparkline r={r} />
      </div>

      <div className={s.cardMeta}>
        {dev && <p className={s.dev}>{dev}</p>}
        <p className={ui.caption}>{metaLine(r)}</p>
      </div>

      {step && (
        <footer className={s.cardFoot}>
          <p className={ui.small}>
            <span className={ui.caption}>Next step</span>
            <br />
            {step}
          </p>
          <button type="button" className={ui.btnText} onClick={() => onWhy?.(r.id)}>
            Why?
          </button>
        </footer>
      )}
    </article>
  )
}

/* ── Within your usual range ─────────────────────────────────────────────────── */

export function InRange({ data, readings, zoneLevels }: { data: TodayView; readings: Reading[]; zoneLevels: Record<ZoneId, Level> }) {
  if (!readings.length) return null
  const allNormal = ZONES.filter((z) => zoneLevels[z.id] === 'ok')
  const measured = data.readings.filter((r) => r.level !== 'none').length
  const ok = readings.filter((r) => r.level === 'ok').length
  return (
    <section className={ui.section} aria-labelledby="today-inrange">
      <div className={ui.sectionHead}>
        <h2 id="today-inrange" className={`${ui.h2} ${s.withIcon}`}>
          <span className={s.check} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5 10 17.5 19 7" />
            </svg>
          </span>
          Within your usual range
        </h2>
        <span className={ui.sectionMeta}>
          {ok} of {measured} readings
          {data.checkIn.streakDays > 1 && ` · ${data.checkIn.streakDays}-day check-in streak`}
        </span>
      </div>
      {allNormal.length > 0 && (
        <ul className={s.chips} aria-label="Zones with every reading normal">
          {allNormal.map((z) => (
            <li key={z.id}>
              <ZoneIcon zone={z.id} className={s.chipIcon} />
              {z.label}
            </li>
          ))}
        </ul>
      )}
      <ul className={s.tiles}>
        {readings.map((r, i) => (
          <li key={r.id} className={`${ui.card} ${s.tile} ${s[r.level]}`} style={{ '--i': i } as CSSProperties}>
            <span className={s.tileHead}>
              <ZoneIcon zone={r.zone} className={s.tileIcon} />
              <span className={s.tileLabel}>{r.label}</span>
              <StatusIcon level={r.level} />
            </span>
            <span className={s.tileRow}>
              <span className={s.tileValue}>
                {formatValue(r)}
                <span className={ui.unit}>{r.unit}</span>
              </span>
              <Sparkline r={r} small />
            </span>
            <RangeBar r={r} />
            <span className={ui.caption}>{metaLine(r)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── This week: zone-by-day grid for the last 7 days ─────────────────────────── */

export function ThisWeek({ data, onOpenReport }: { data: TodayView; onOpenReport?: () => void }) {
  const logged = data.week.filter((d) => d.zones).length
  return (
    <section className={ui.section} aria-labelledby="today-week">
      <div className={ui.sectionHead}>
        <h2 id="today-week" className={ui.h2}>
          This week
        </h2>
        <span className={s.sectionTools}>
          <span className={ui.sectionMeta}>
            {logged} of {data.week.length} days logged · {data.checkIn.streakDays}-day streak
          </span>
          {onOpenReport && (
            <button type="button" className={ui.btnText} onClick={onOpenReport}>
              View full report <span aria-hidden="true">→</span>
            </button>
          )}
        </span>
      </div>
      <div className={`${ui.card} ${s.weekCard}`}>
        <table className={s.week}>
          <caption className={ui.srOnly}>Status of each zone for the last {data.week.length} days</caption>
          <thead>
            <tr>
              <th scope="col">Zone</th>
              {data.week.map((d) => (
                <th key={d.day} scope="col">
                  {d.day === data.missionDay ? 'Today' : `Day ${d.day}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ZONES.map((z) => (
              <tr key={z.id}>
                <th scope="row">
                  <ZoneIcon zone={z.id} className={s.tileIcon} />
                  {z.label}
                </th>
                {data.week.map((d) => {
                  const l = d.zones?.[z.id]
                  return (
                    <td key={d.day} aria-label={l ? LEVEL_WORD[l] : 'No check-in'}>
                      {!l ? <span className={s.weekGap}>–</span> : isFlagged(l) ? <StatusIcon level={l} /> : <span className={`${s.weekDot} ${s[l]}`} />}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
