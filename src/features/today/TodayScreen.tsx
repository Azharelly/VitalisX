import { useState } from 'react'
import { BodyFigure, ZoneButton } from './BodyFigure'
import { GuidancePanel } from './GuidancePanel'
import { AttentionCard, InRange, NextStepCard, ThisWeek } from './sections'
import { StatusBadge } from './StatusIcon'
import { ZoneIcon } from './ZoneIcon'
import { LEVEL_WORD, ZONES, byAttention, isFlagged, worst, type Level, type Reading, type TodayView, type ZoneId } from './model'
import ui from './shared.module.css'
import s from './today.module.css'

/** Everything the Today page can ask the app to do. All optional; the app wires the ones it supports. */
export interface TodayActions {
  /** Back to the crew overview. Shows a "Crew" link when set. */
  onBack?: () => void
  /** Open the emergency flow (F-08) for this person. */
  onEmergency?: (crewId: string) => void
  /** Open the Why? modal (F-05) for a metric. */
  onWhy?: (metricId: string) => void
  /** Log that self-care for a metric has started (action_log, kind = done). */
  onStart?: (crewId: string, metricId: string) => void
  /** Open the Earth link / SBAR draft (F-07), optionally about one metric. */
  onNoteForEarth?: (crewId: string, metricId?: string) => void
  /** Go to Check-in (F-03) for this person. */
  onStartCheckIn?: (crewId: string) => void
  /** Open the full week/month Report for this person (shows a link under "This week" when set). */
  onOpenReport?: (crewId: string) => void
}

const OFF_BODY: ZoneId[] = ['immune', 'meta', 'radiation'] // whole-body zones: auras on the figure, tiles below it
const zoneLabel = (z: ZoneId) => ZONES.find((x) => x.id === z)!.label

/** The full Today page for one crew member. Presentational: give it a TodayView, get callbacks back. */
export function TodayScreen({ data, ...actions }: { data: TodayView } & TodayActions) {
  const [zone, setZone] = useState<ZoneId | null>(null)
  const toggle = (z: ZoneId) => setZone((cur) => (cur === z ? null : z))
  const id = data.person.id

  const ranked = [...data.readings].sort(byAttention)
  const levels = {} as Record<ZoneId, Level>
  const headline: Partial<Record<ZoneId, Reading>> = {}
  for (const z of ZONES) {
    const inZone = ranked.filter((r) => r.zone === z.id)
    levels[z.id] = worst(inZone.map((r) => r.level))
    headline[z.id] = inZone[0]
  }
  const overall = worst(Object.values(levels))
  const allFlagged = ranked.filter((r) => isFlagged(r.level))
  const shown = ranked.filter((r) => !zone || r.zone === zone)
  const flagged = shown.filter((r) => isFlagged(r.level))
  const inRange = shown.filter((r) => !isFlagged(r.level) && r.level !== 'none')
  const initials = data.person.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <section className={`${ui.root} ${s.page}`} aria-labelledby="today-name">
      <div className={s.topBar}>
        {actions.onBack ? (
          <button type="button" className={ui.btnText} onClick={actions.onBack}>
            <span aria-hidden="true">←</span> Crew
          </button>
        ) : (
          <span />
        )}
        <button type="button" className={s.emergency} onClick={() => actions.onEmergency?.(id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3 22 20H2ZM12 10v4M12 17v.5" />
          </svg>
          Emergency
        </button>
      </div>

      <header className={`${ui.card} ${s.identity}`}>
        <div className={s.who}>
          <span className={`${s.avatar} ${s[overall]}`} aria-hidden="true">
            {initials}
          </span>
          <div>
            <p className={ui.caption}>Viewing</p>
            <h1 id="today-name" className={ui.title}>
              {data.person.name}
            </h1>
            <p className={`${ui.small} ${ui.muted}`}>{data.person.role}</p>
          </div>
        </div>
        <dl className={s.facts}>
          <div>
            <dt className={ui.caption}>Status</dt>
            <dd>
              <StatusBadge level={overall} label={LEVEL_WORD[overall]} />
            </dd>
          </div>
          <div>
            <dt className={ui.caption}>Mission day</dt>
            <dd className={s.fact}>{data.missionDay}</dd>
          </div>
          <div>
            <dt className={ui.caption}>Check-in</dt>
            <dd className={s.fact}>
              {data.checkIn.doneAt ?? (
                <button type="button" className={ui.btnText} onClick={() => actions.onStartCheckIn?.(id)}>
                  Start check-in
                </button>
              )}
            </dd>
          </div>
          {data.isSimulated && (
            <div>
              <dt className={ui.srOnly}>Data</dt>
              <dd>
                <span className={ui.tag}>Simulated data</span>
              </dd>
            </div>
          )}
        </dl>
      </header>

      <div className={s.layout}>
        <aside className={`${ui.card} ${s.bodyPanel}`} aria-label="Body map">
          <div className={ui.sectionHead}>
            <h2 className={ui.h3}>Body</h2>
            <span className={ui.caption}>Select a zone to filter</span>
          </div>
          <BodyFigure levels={levels} headline={headline} selected={zone} onSelect={toggle} />
          {/* Column labels above the whole-body tiles: how each one shows on the figure. */}
          <ul className={s.legend} aria-label="How whole-body zones show on the figure">
            <li><span className={s.keyOutline} aria-hidden="true" /> Aura: outline</li>
            <li><span className={s.keyCore} aria-hidden="true" /> Aura: core</li>
            <li><span className={s.keyField} aria-hidden="true" /> Aura: outer field</li>
          </ul>
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
                className={s.zoneTile}
                icon
              />
            ))}
          </div>
        </aside>

        <div className={s.main}>
          {zone ? (
            <section className={`${ui.card} ${s.zoneDetail}`} aria-labelledby="today-zone">
              <div className={s.zoneDetailHead}>
                <ZoneIcon zone={zone} className={s.zoneDetailIcon} />
                <h2 id="today-zone" className={ui.h2}>
                  {zoneLabel(zone)}
                </h2>
                <StatusBadge level={levels[zone]} label={LEVEL_WORD[levels[zone]]} />
                <button type="button" className={`${ui.btnText} ${s.pushRight}`} onClick={() => setZone(null)}>
                  Show all zones
                </button>
              </div>
              {headline[zone] && <GuidancePanel metricId={headline[zone]!.id} open />}
            </section>
          ) : (
            <NextStepCard
              data={data}
              flagged={allFlagged}
              onStart={(m) => actions.onStart?.(id, m)}
              onWhy={actions.onWhy}
              onNoteForEarth={(m) => actions.onNoteForEarth?.(id, m)}
              onStartCheckIn={() => actions.onStartCheckIn?.(id)}
            />
          )}

          {shown.length === 0 && (
            <p className={`${ui.card} ${s.empty}`}>{zone ? 'No readings for this zone yet.' : 'No readings yet. Complete a check-in to start learning your normal.'}</p>
          )}

          {flagged.length > 0 && (
            <section className={ui.section} aria-labelledby="today-attention">
              <div className={ui.sectionHead}>
                <h2 id="today-attention" className={ui.h2}>
                  Needs attention
                </h2>
                <span className={ui.sectionMeta}>
                  {flagged.length} {flagged.length === 1 ? 'reading' : 'readings'}
                </span>
              </div>
              <div className={s.cards}>
                {flagged.map((r) => (
                  <AttentionCard key={r.id} r={r} onWhy={actions.onWhy} />
                ))}
              </div>
            </section>
          )}

          <InRange data={data} readings={inRange} zoneLevels={levels} />

          {!zone && <ThisWeek data={data} onOpenReport={actions.onOpenReport && (() => actions.onOpenReport!(id))} />}
        </div>
      </div>
    </section>
  )
}
