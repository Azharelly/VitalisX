import type { CSSProperties } from 'react'
import { actionFor } from '../../data/guidance'
import { RangeBar, Sparkline } from './Charts'
import { GuidancePanel } from './GuidancePanel'
import { StatusIcon } from './StatusIcon'
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
import s from './today.module.css'

// The Today page's sections. Each one is presentational: data in, callbacks out, no fetching.

const zoneLabel = (z: ZoneId) => ZONES.find((x) => x.id === z)!.label

/* ── Next best action ─────────────────────────────────────────────────────────── */

interface NextProps {
  data: TodayView
  flagged: Reading[] // all Watch/Alert readings, most urgent first
  onStart?: (metricId: string) => void
  onWhy?: (metricId: string) => void
  onNoteForEarth?: (metricId?: string) => void
  onStartCheckIn?: () => void
}

export function NextActionCard({ data, flagged, onStart, onWhy, onNoteForEarth, onStartCheckIn }: NextProps) {
  const na = data.nextAction
  const target = na.kind === 'metric' ? data.readings.find((r) => r.id === na.metricId) : undefined
  const level: Level = target?.level ?? 'ok'
  const then = flagged.filter((r) => r.id !== target?.id)
  const first = data.person.name.split(' ')[0]

  return (
    <article className={`${s.next} ${s[level]}`} aria-labelledby="today-next">
      <p className={s.eyebrow}>Next best action · {first}</p>
      {target ? (
        <>
          <span className={s.badge}>
            <StatusIcon level={target.level} /> {LEVEL_WORD[target.level]}
          </span>
          <h2 id="today-next" className={s.nextTitle}>
            {headline(target)}
          </h2>
          <p className={s.nextText}>{actionFor(target.id, target.level)}</p>
          <div className={s.nextFoot}>
            <button type="button" className={s.primaryBtn} onClick={() => onStart?.(target.id)}>
              Start
            </button>
            <button type="button" className={s.why} onClick={() => onWhy?.(target.id)}>
              Why am I seeing this?
            </button>
            <button type="button" className={s.ghostBtn} onClick={() => onNoteForEarth?.(target.id)}>
              Note for Earth
            </button>
          </div>
          {then.length > 0 && <p className={s.then}>Then: {then.map((r) => r.label).join(', ')}.</p>}
          <details className={s.nextGuide}>
            <summary>More about {target.label.toLowerCase()}</summary>
            <GuidancePanel metricId={target.id} />
          </details>
        </>
      ) : (
        <>
          <h2 id="today-next" className={s.nextTitle}>
            {na.kind === 'learning'
              ? 'Learning your normal'
              : data.checkIn.doneAt
                ? 'All readings are in your usual range'
                : "Today's check-in is due"}
          </h2>
          <p className={s.nextText}>
            {na.kind === 'learning'
              ? `${na.checkInsLeft} more check-in${na.checkInsLeft === 1 ? '' : 's'} until VitalisX can compare you with your own normal.`
              : data.checkIn.doneAt
                ? 'Nothing to do now. Keep following your plan.'
                : 'It takes about a minute. Your readings are compared with your own normal.'}
          </p>
          {!data.checkIn.doneAt && (
            <div className={s.nextFoot}>
              <button type="button" className={s.primaryBtn} onClick={onStartCheckIn}>
                Start check-in
              </button>
            </div>
          )}
        </>
      )}
      <p className={s.fine}>Decision support, not a diagnosis. Follow mission procedures.</p>
    </article>
  )
}

/* ── Needs attention ──────────────────────────────────────────────────────────── */

export function AttentionCard({ r, onWhy }: { r: Reading; onWhy?: (id: string) => void }) {
  const dev = deviation(r)
  const step = actionFor(r.id, r.level)
  return (
    <article className={`${s.card} ${s[r.level]}`}>
      <header className={s.cardHead}>
        <span className={s.iconCircle}>
          <ZoneIcon zone={r.zone} />
        </span>
        <span className={s.cardTitle}>
          <span className={s.cardLabel}>{r.label}</span>
          <span className={s.muted}>{[zoneLabel(r.zone), r.context].filter(Boolean).join(' · ')}</span>
        </span>
        <span className={s.badge}>
          <StatusIcon level={r.level} /> {LEVEL_WORD[r.level]}
        </span>
      </header>

      <div className={s.cardBody}>
        <p className={s.value}>
          {formatValue(r)}
          <span className={s.unit}>{r.unit}</span>
        </p>
        <Sparkline r={r} />
      </div>

      <p className={s.cardMeta}>
        {dev && <strong className={s.dev}>{dev}</strong>}
        {[usualText(r) || r.note, r.measured].filter(Boolean).join(' · ')}
      </p>

      {step && (
        <div className={s.step}>
          <p>
            <span className={s.eyebrow}>Next step</span>
            {step}
          </p>
          <button type="button" className={s.why} onClick={() => onWhy?.(r.id)}>
            Why?
          </button>
        </div>
      )}
    </article>
  )
}

/* ── Good news: everything inside the person's normal ────────────────────────── */

export function GoodNews({ data, normal, zoneLevels }: { data: TodayView; normal: Reading[]; zoneLevels: Record<ZoneId, Level> }) {
  if (!normal.length) return null
  const allClearZones = ZONES.filter((z) => zoneLevels[z.id] === 'ok')
  const total = data.readings.filter((r) => r.level !== 'none').length
  const inRange = normal.filter((r) => r.level === 'ok').length
  return (
    <section aria-labelledby="today-good" className={s.goodWrap}>
      <div className={s.goodHead}>
        <span className={s.goodCheck} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 10 17.5 19 7" />
          </svg>
        </span>
        <div>
          <h2 id="today-good" className={s.goodTitle}>
            Good news
          </h2>
          <p className={s.muted}>
            {inRange} of {total} readings are inside your usual range
            {data.checkIn.streakDays > 1 && ` · ${data.checkIn.streakDays}-day check-in streak`}
          </p>
        </div>
      </div>
      {allClearZones.length > 0 && (
        <ul className={s.clearZones} aria-label="Zones all normal">
          {allClearZones.map((z) => (
            <li key={z.id}>
              <ZoneIcon zone={z.id} className={s.clearIcon} />
              {z.label}
            </li>
          ))}
        </ul>
      )}
      <ul className={s.tiles}>
        {normal.map((r, i) => (
          <li key={r.id} className={`${s.tile} ${s[r.level]}`} style={{ '--i': i } as CSSProperties}>
            <span className={s.tileHead}>
              <ZoneIcon zone={r.zone} className={s.tileIcon} />
              {r.label}
              <StatusIcon level={r.level} />
            </span>
            <span className={s.tileRow}>
              <span className={s.tileValue}>
                {formatValue(r)}
                <span className={s.unit}>{r.unit}</span>
              </span>
              <Sparkline r={r} small />
            </span>
            <RangeBar r={r} />
            <span className={s.tileMeta}>{[usualText(r) || r.note, r.measured].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── My week: zone-by-day grid for the last 7 days ───────────────────────────── */

export function MyWeek({ data, onOpenReport }: { data: TodayView; onOpenReport?: () => void }) {
  const logged = data.week.filter((d) => d.zones).length
  return (
    <section aria-labelledby="today-week" className={s.weekWrap}>
      <div className={s.weekHead}>
        <h2 id="today-week" className={s.h2}>
          My week
        </h2>
        <span className={s.weekStats}>
          <span>
            <strong>{logged}</strong> of {data.week.length} days logged
          </span>
          <span>
            <strong>{data.checkIn.streakDays}</strong>-day streak
          </span>
          {onOpenReport && (
            <button type="button" className={s.linkBtn} onClick={onOpenReport}>
              Open full report →
            </button>
          )}
        </span>
      </div>
      <div className={s.weekScroll}>
        <table className={s.week}>
          <caption className={s.srOnly}>Status of each zone for the last {data.week.length} days</caption>
          <thead>
            <tr>
              <th scope="col">Zone</th>
              {data.week.map((d) => (
                <th key={d.day} scope="col">
                  {d.day === data.missionDay ? 'Today' : `D${d.day}`}
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
