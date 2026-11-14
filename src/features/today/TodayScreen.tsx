import { Avatar } from '../crew/Avatar'
import { useState } from 'react'
import { BodyFigure, ZoneButton } from './BodyFigure'
import { GuidancePanel } from './GuidancePanel'
import { AttentionCard, GoodNews, MyWeek, NextActionCard } from './sections'
import { StatusIcon } from './StatusIcon'
import { ZoneIcon } from './ZoneIcon'
import { LEVEL_WORD, ZONES, byAttention, isFlagged, usualText, worst, type Level, type Reading, type TodayView, type ZoneId } from './model'
import s from './today.module.css'
import { WhyModal } from '../why/WhyModal'
import { fromReading } from '../why/evidence.ts'

/** Everything the Today page can ask the app to do. All optional; the app wires the ones it supports. */
export interface TodayActions {
  /** Back to the crew overview. Shows a "Crew" link when set (leave unset inside AppShell: the tabs do this). */
  onBack?: () => void
  /** Open the emergency flow (F-08) for this person. Shows an Emergency button when set (AppShell has its own). */
  onEmergency?: (crewId: string) => void
  /** Open the Why? modal (F-05) for a metric. */
  onWhy?: (metricId: string) => void
  /** Log that self-care for a metric has started (action_log, kind = done). */
  onStart?: (crewId: string, metricId: string) => void
  /** Open the Earth link / SBAR draft (F-07), optionally about one metric. */
  onNoteForEarth?: (crewId: string, metricId?: string) => void
  /** Go to Check-in (F-03) for this person. */
  onStartCheckIn?: (crewId: string) => void
  /** Open the full week/month Report for this person (shows a link under "My week" when set). */
  onOpenReport?: (crewId: string) => void
}

const OFF_BODY: ZoneId[] = ['immune', 'meta', 'radiation'] // no single spot on the figure, so they also get tiles
const zoneLabel = (z: ZoneId) => ZONES.find((x) => x.id === z)!.label

/** The full Today page for one crew member. Presentational: give it a TodayView, get callbacks back. */
export function TodayScreen({ data, ...actions }: { data: TodayView } & TodayActions) {
  const [zone, setZone] = useState<ZoneId | null>(null)
  const toggle = (z: ZoneId) => setZone((cur) => (cur === z ? null : z))
  const id = data.person.id
  const [whyId, setWhyId] = useState<string | null>(null)
  const why = data.readings.find((r) => r.id === whyId)
  const onWhy = (metricId: string) => {
    setWhyId(metricId)
    actions.onWhy?.(metricId)
  }

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
  const normal = shown.filter((r) => !isFlagged(r.level) && r.level !== 'none')
  const initials = data.person.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <section className={s.root} aria-labelledby="today-viewing">
      {(actions.onBack || actions.onEmergency) && ( // inside AppShell both live in the header, so this bar is not drawn
        <div className={s.topBar}>
          {actions.onBack ? (
            <button type="button" className={s.backBtn} onClick={actions.onBack}>
              <span aria-hidden="true">←</span> Crew
            </button>
          ) : (
            <span />
          )}
          {actions.onEmergency && (
            <button type="button" className={s.emergency} onClick={() => actions.onEmergency?.(id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3 22 20H2ZM12 10v4M12 17v.5" />
              </svg>
              Emergency
            </button>
          )}
        </div>
      )}

      <header className={s.banner}>
        <div className={s.who}>
          <Avatar initials={initials} status={overall} />
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
          {data.checkIn.doneAt ? (
            <span className={s.metaItem}>
              <span className={s.eyebrow}>Checked in</span>
              <span className={s.metaNum}>{data.checkIn.doneAt}</span>
            </span>
          ) : (
            <button type="button" className={s.dueBtn} onClick={() => actions.onStartCheckIn?.(id)}>
              Check-in due · start
            </button>
          )}
          {data.isSimulated && <span className={s.sim}>Simulated data</span>}
        </div>
      </header>

      <div className={s.layout}>
        <div className={s.bodyPanel}>
          <BodyFigure sex={data.person.sex} levels={levels} headline={headline} selected={zone} onSelect={toggle} />
          <ul className={s.auraLegend} aria-label="How to read the body">
            <li><strong>Glow colour</strong> status</li>
            <li><strong>Outer field</strong> radiation</li>
            <li><strong>Body outline</strong> immune</li>
            <li><strong>Core</strong> metabolism</li>
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
                className={s.tileBtn}
                icon
              />
            ))}
          </div>
        </div>

        <div className={s.right}>
          {zone && (
            <section className={s.zoneDetail} aria-labelledby="today-zone">
              <div className={s.filter}>
                <span className={s.filterName}>
                  <ZoneIcon zone={zone} className={s.filterIcon} />
                  <span id="today-zone">{zoneLabel(zone)}</span>
                  <span className={`${s.badge} ${s[levels[zone]]}`}>
                    <StatusIcon level={levels[zone]} /> {LEVEL_WORD[levels[zone]]}
                  </span>
                </span>
                <button type="button" className={s.linkBtn} onClick={() => setZone(null)}>
                  Show all zones
                </button>
              </div>
              {headline[zone] && <GuidancePanel metricId={headline[zone]!.id} open />}
              {headline[zone] && usualText(headline[zone]!) && (
                <p className={s.zoneUsual}>{usualText(headline[zone]!)}</p>
              )}
            </section>
          )}

          <NextActionCard
            data={data}
            flagged={allFlagged}
            onStart={(m) => actions.onStart?.(id, m)}
            onWhy={onWhy}
            onNoteForEarth={(m) => actions.onNoteForEarth?.(id, m)}
            onStartCheckIn={() => actions.onStartCheckIn?.(id)}
          />

          {shown.length === 0 && (
            <p className={s.empty}>{zone ? 'No readings for this zone yet.' : "No readings yet. Do today's check-in to start learning your normal."}</p>
          )}

          {flagged.length > 0 && (
            <section aria-labelledby="today-attention">
              <h2 id="today-attention" className={s.h2}>
                Needs attention <span className={s.count}>{flagged.length}</span>
              </h2>
              <div className={s.cards}>
                {flagged.map((r) => (
                  <AttentionCard key={r.id} r={r} onWhy={onWhy} />
                ))}
              </div>
            </section>
          )}

          <GoodNews data={data} normal={normal} zoneLevels={levels} />

          {!zone && <MyWeek data={data} onOpenReport={actions.onOpenReport && (() => actions.onOpenReport!(id))} />}
        </div>
      </div>
      {why && <WhyModal e={fromReading(why)} onClose={() => setWhyId(null)} />}
    </section>
  )
}
