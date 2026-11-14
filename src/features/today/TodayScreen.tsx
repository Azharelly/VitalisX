import { useState } from 'react'
import { BodyFigure } from './BodyFigure'
import { StatusIcon } from './StatusIcon'
import { LEVEL_WORD, ZONES, byAttention, formatValue, isFlagged, worst, type Level, type Reading, type TodayView, type ZoneId } from './model'
import s from './today.module.css'

interface Props {
  data: TodayView
  onWhy?: (metricId: string) => void // opens the Why? modal (F-05)
}

export function TodayScreen({ data, onWhy }: Props) {
  const [zone, setZone] = useState<ZoneId | null>(null)
  const toggle = (z: ZoneId) => setZone((cur) => (cur === z ? null : z))

  const levels = Object.fromEntries(
    ZONES.map((z) => [z.id, worst(data.readings.filter((r) => r.zone === z.id).map((r) => r.level))]),
  ) as Record<ZoneId, Level>
  const overall = worst(Object.values(levels))
  const shown = data.readings.filter((r) => !zone || r.zone === zone).sort(byAttention)
  const flagged = shown.filter((r) => isFlagged(r.level))
  const rest = shown.filter((r) => !isFlagged(r.level))
  const zoneLabel = ZONES.find((z) => z.id === zone)?.label

  return (
    <section className={s.root} aria-labelledby="today-viewing">
      <header className={`${s.banner} ${s[overall]}`}>
        <div>
          <p className={s.eyebrow}>Viewing</p>
          <h1 id="today-viewing" className={s.name}>
            {data.person.name} <span className={s.role}>{data.person.role}</span>
          </h1>
        </div>
        <div className={s.bannerMeta}>
          <span className={s.badge}>
            <StatusIcon level={overall} /> {LEVEL_WORD[overall]}
          </span>
          <span>Mission day {data.missionDay}</span>
          <span className={s.sim}>Simulated data</span>
        </div>
      </header>

      <div className={s.layout}>
        <div className={s.left}>
          <BodyFigure levels={levels} selected={zone} onSelect={toggle} />
          <ul className={s.zoneList} aria-label="Zones">
            {ZONES.map((z) => (
              <li key={z.id}>
                <button
                  type="button"
                  className={`${s.chip} ${isFlagged(levels[z.id]) ? s[levels[z.id]] : ''}`}
                  aria-pressed={zone === z.id}
                  onClick={() => toggle(z.id)}
                >
                  <StatusIcon level={levels[z.id]} />
                  <span>{z.label}</span>
                  <span className={s.chipWord}>{LEVEL_WORD[levels[z.id]]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={s.right}>
          <article className={s.next}>
            <p className={s.eyebrow}>Next action</p>
            <p className={s.nextText}>{data.nextAction.text}</p>
            {data.nextAction.metricId && (
              <button type="button" className={s.why} onClick={() => onWhy?.(data.nextAction.metricId!)}>
                Why?
              </button>
            )}
            <p className={s.fine}>Decision support, not a diagnosis.</p>
          </article>

          {zone && (
            <div className={s.filter}>
              <span>
                Showing <strong>{zoneLabel}</strong>
              </span>
              <button type="button" className={s.linkBtn} onClick={() => setZone(null)}>
                Show all zones
              </button>
            </div>
          )}

          {shown.length === 0 && (
            <p className={s.empty}>
              {zone ? 'No readings for this zone yet.' : "No readings yet. Do today's check-in to start learning your normal."}
            </p>
          )}

          {flagged.length > 0 && (
            <section aria-label="Needs attention">
              <h2 className={s.h2}>Needs attention</h2>
              <div className={s.cards}>
                {flagged.map((r) => (
                  <FlaggedCard key={r.id} r={r} onWhy={onWhy} />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section aria-label="Within your normal">
              <h2 className={s.h2}>Within your normal</h2>
              <ul className={s.rows}>
                {rest.map((r) => (
                  <li key={r.id} className={s.row}>
                    <StatusIcon level={r.level} />
                    <span className={s.rowLabel}>
                      {r.label}
                      {r.note && <span className={s.muted}> · {r.note}</span>}
                    </span>
                    <span className={s.rowValue}>
                      {formatValue(r)} <span className={s.unit}>{r.unit}</span>
                    </span>
                    <span className={s.muted}>{usualText(r)}</span>
                    <span className={s.muted}>{r.measured}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </section>
  )
}

function FlaggedCard({ r, onWhy }: { r: Reading; onWhy?: (id: string) => void }) {
  return (
    <article className={`${s.card} ${s[r.level]}`}>
      <header className={s.cardHead}>
        <span>
          {r.label}
          {r.context && <span className={s.muted}> · {r.context}</span>}
        </span>
        <span className={s.badge}>
          <StatusIcon level={r.level} /> {LEVEL_WORD[r.level]}
        </span>
      </header>
      <p className={s.value}>
        {formatValue(r)} <span className={s.unit}>{r.unit}</span>
      </p>
      <p className={s.muted}>{[usualText(r), r.measured].filter(Boolean).join(' · ')}</p>
      {r.note && <p>{r.note}</p>}
      {r.action && (
        <p className={s.action}>
          <strong>Next step:</strong> {r.action}
        </p>
      )}
      <button type="button" className={s.why} onClick={() => onWhy?.(r.id)}>
        Why?
      </button>
    </article>
  )
}

function usualText(r: Reading) {
  if (r.level === 'learn') return 'Learning your normal'
  if (!r.usual) return ''
  const [lo, hi] = r.usual
  return `Your usual ${lo.toFixed(r.decimals)}–${hi.toFixed(r.decimals)} ${r.unit}`
}
