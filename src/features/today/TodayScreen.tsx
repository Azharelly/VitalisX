import { useState } from 'react'
import { BodyFigure, ZoneButton } from './BodyFigure'
import { RangeBar, Sparkline } from './Charts'
import { StatusIcon } from './StatusIcon'
import { ZoneIcon } from './ZoneIcon'
import {
  LEVEL_WORD,
  ZONES,
  byAttention,
  deviation,
  formatValue,
  isFlagged,
  worst,
  type Level,
  type Reading,
  type TodayView,
  type ZoneId,
} from './model'
import s from './today.module.css'

interface Props {
  data: TodayView
  onWhy?: (metricId: string) => void // opens the Why? modal (F-05)
}

const OFF_BODY: ZoneId[] = ['immune', 'meta', 'radiation'] // no place on the figure, so they get tiles
const zoneLabel = (z: ZoneId) => ZONES.find((x) => x.id === z)!.label

export function TodayScreen({ data, onWhy }: Props) {
  const [zone, setZone] = useState<ZoneId | null>(null)
  const toggle = (z: ZoneId) => setZone((cur) => (cur === z ? null : z))

  const ranked = [...data.readings].sort(byAttention)
  const levels = {} as Record<ZoneId, Level>
  const headline: Partial<Record<ZoneId, Reading>> = {}
  for (const z of ZONES) {
    const inZone = ranked.filter((r) => r.zone === z.id)
    levels[z.id] = worst(inZone.map((r) => r.level))
    headline[z.id] = inZone[0]
  }
  const overall = worst(Object.values(levels))
  const shown = ranked.filter((r) => !zone || r.zone === zone)
  const flagged = shown.filter((r) => isFlagged(r.level))
  const rest = shown.filter((r) => !isFlagged(r.level))
  const target = data.readings.find((r) => r.id === data.nextAction.metricId)
  const initials = data.person.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <section className={s.root} aria-labelledby="today-viewing">
      <header className={s.banner}>
        <div className={s.who}>
          <span className={`${s.avatar} ${s[overall]}`} aria-hidden="true">
            {initials}
          </span>
          <div>
            <p className={s.eyebrow}>Viewing</p>
            <h1 id="today-viewing" className={s.name}>
              {data.person.name}
            </h1>
            <p className={s.muted}>{data.person.role}</p>
          </div>
        </div>
        <div className={s.bannerMeta}>
          <span className={`${s.pill} ${s[overall]}`}>
            <StatusIcon level={overall} /> {LEVEL_WORD[overall]}
          </span>
          <span className={s.metaItem}>
            <span className={s.eyebrow}>Mission day</span>
            <span className={s.metaNum}>{data.missionDay}</span>
          </span>
          <span className={s.sim}>Simulated data</span>
        </div>
      </header>

      <div className={s.layout}>
        <div className={s.bodyPanel}>
          <BodyFigure levels={levels} headline={headline} selected={zone} onSelect={toggle} />
          <div className={s.offBody}>
            {OFF_BODY.map((z) => (
              <ZoneButton
                key={z}
                id={z}
                label={zoneLabel(z)}
                level={levels[z]}
                reading={headline[z]}
                selected={zone === z}
                onSelect={toggle}
                className={s.tileBtn}
                icon
              />
            ))}
          </div>
        </div>

        <div className={s.right}>
          <article className={`${s.next} ${target ? s[target.level] : s.ok}`}>
            <p className={s.eyebrow}>Next action</p>
            <p className={s.nextText}>{data.nextAction.text}</p>
            <div className={s.nextFoot}>
              {target && (
                <span className={s.nextLink}>
                  <StatusIcon level={target.level} />
                  {target.label}
                  <span className={s.mono}>
                    {formatValue(target)} {target.unit}
                  </span>
                </span>
              )}
              {target && (
                <button type="button" className={s.why} onClick={() => onWhy?.(target.id)}>
                  Why?
                </button>
              )}
            </div>
            <p className={s.fine}>Decision support, not a diagnosis. Follow mission procedures.</p>
          </article>

          {zone && (
            <div className={s.filter}>
              <span className={s.filterName}>
                <ZoneIcon zone={zone} className={s.filterIcon} />
                {zoneLabel(zone)}
                <span className={s.muted}>
                  {shown.length} reading{shown.length === 1 ? '' : 's'}
                </span>
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
            <section aria-labelledby="today-attention">
              <h2 id="today-attention" className={s.h2}>
                Needs attention <span className={s.count}>{flagged.length}</span>
              </h2>
              <div className={s.cards}>
                {flagged.map((r) => (
                  <FlaggedCard key={r.id} r={r} onWhy={onWhy} />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section aria-labelledby="today-normal">
              <h2 id="today-normal" className={s.h2}>
                Within your normal <span className={s.count}>{rest.length}</span>
              </h2>
              <ul className={s.tiles}>
                {rest.map((r) => (
                  <li key={r.id} className={s.tile}>
                    <span className={s.tileHead}>
                      <ZoneIcon zone={r.zone} className={s.tileIcon} />
                      {r.label}
                      {r.level === 'learn' && <StatusIcon level="learn" />}
                    </span>
                    <span className={s.tileValue}>
                      {formatValue(r)}
                      <span className={s.unit}>{r.unit}</span>
                    </span>
                    <RangeBar r={r} />
                    <span className={s.tileMeta}>{[usualText(r) || r.note, r.measured].filter(Boolean).join(' · ')}</span>
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
  const dev = deviation(r)
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

      {r.action && (
        <div className={s.step}>
          <p>
            <span className={s.eyebrow}>Next step</span>
            {r.action}
          </p>
          <button type="button" className={s.why} onClick={() => onWhy?.(r.id)}>
            Why?
          </button>
        </div>
      )}
    </article>
  )
}

function usualText(r: Reading) {
  if (r.level === 'learn') return 'Learning your normal'
  if (!r.usual) return ''
  const [lo, hi] = r.usual
  return `Usual ${lo.toFixed(r.decimals)}–${hi.toFixed(r.decimals)}`
}
