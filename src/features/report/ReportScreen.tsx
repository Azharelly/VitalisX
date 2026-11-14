import type { ReactNode } from 'react'
import { ZONES, LEVEL_WORD, changeText, isFlagged, type Level, type ReportMetric, type ReportView } from '../today/model.ts'
import { StatusBadge } from '../today/StatusIcon'
import { ZoneIcon } from '../today/ZoneIcon'
import ui from '../today/shared.module.css'
import { BudgetBar, DoseChart, TrendChart, ZoneRibbon } from './ReportCharts'
import s from './report.module.css'

/** Everything the Report page can ask the app to do. All optional. */
export interface ReportActions {
  /** Back to this person's Today page. */
  onBack?: () => void
  /** Switch the period (the connected <Report> handles this itself). */
  onPeriodChange?: (days: 7 | 28) => void
  /** Open the Earth link with a summary draft (F-07 SBAR). */
  onSendSummary?: (crewId: string, days: number) => void
  /** Open the Why? modal for a metric (F-05). */
  onWhy?: (metricId: string) => void
}

const ZONE_ORDER = ZONES.map((z) => z.id)
const RANK: Record<Level, number> = { alert: 0, watch: 1, learn: 2, ok: 3, none: 4 }

/** Week or month in review for one crew member. Presentational: data in, callbacks out. */
export function ReportScreen({ report, ...actions }: { report: ReportView } & ReportActions) {
  const period = report.days === 7 ? 'week' : 'month'
  const firstDay = report.zones[0]?.day ?? report.missionDay
  const open = report.metrics.filter((m) => isFlagged(m.level)).sort((a, b) => RANK[a.level] - RANK[b.level] || a.priority - b.priority)
  const sorted = [...report.metrics].sort(
    (a, b) => RANK[a.level] - RANK[b.level] || ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone) || a.priority - b.priority,
  )
  const rad = report.radiation
  const radPct = Math.round((rad.careerMsv / rad.limitMsv) * 100)
  const projPct = rad.projectedMsv === null ? null : Math.round((rad.projectedMsv / rad.limitMsv) * 100)
  const radLevel: Level = rad.daily.at(-1)?.storm || (projPct ?? radPct) >= 100 ? 'alert' : (projPct ?? radPct) >= 80 ? 'watch' : 'ok'

  return (
    <section className={`${ui.root} ${s.page}`} aria-labelledby="report-title">
      <div className={s.topBar}>
        {actions.onBack ? (
          <button type="button" className={ui.btnText} onClick={actions.onBack}>
            <span aria-hidden="true">←</span> Today
          </button>
        ) : (
          <span />
        )}
        <div className={s.toggle} role="group" aria-label="Report period">
          {([7, 28] as const).map((d) => (
            <button key={d} type="button" aria-pressed={report.days === d} onClick={() => actions.onPeriodChange?.(d)}>
              {d === 7 ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      <header className={`${ui.card} ${s.header}`}>
        <div className={s.headerText}>
          <p className={ui.caption}>
            Report · {report.person.name}, {report.person.role}
          </p>
          <h1 id="report-title" className={ui.title}>
            Your {period} in review
          </h1>
          <p className={s.headerMeta}>
            <span className={`${ui.small} ${ui.muted}`}>
              Mission days {firstDay}–{report.missionDay}
            </span>
            {report.isSimulated && <span className={ui.tag}>Simulated data</span>}
          </p>
        </div>
        <button type="button" className={ui.btnPrimary} onClick={() => actions.onSendSummary?.(report.person.id, report.days)}>
          Send summary to Earth
        </button>
      </header>

      <div className={s.kpis}>
        <Kpi label="Days logged" value={report.logged} unit={`of ${report.days}`} />
        <Kpi label="Check-in streak" value={report.streakDays} unit="days" />
        <Kpi label="Open now" value={open.length} unit={open.length === 1 ? 'reading' : 'readings'} level={open[0]?.level} />
        <Kpi label="Career dose" value={radPct} unit={`% of ${rad.limitMsv} mSv`} level={radLevel} />
      </div>

      <Section id="report-summary" title="Summary">
        <ul className={s.summary}>
          <li>
            {report.logged} of {report.days} days logged{report.streakDays > 1 ? `, with a ${report.streakDays}-day check-in streak.` : '.'}
          </li>
          <li>
            {open.length
              ? `Open now: ${open.map((m) => `${m.label} (${LEVEL_WORD[m.level]})`).join(', ')}.`
              : `All body readings ended the ${period} inside your usual range.`}
          </li>
          <li>
            Radiation: {rad.careerMsv} mSv ({radPct}% of the {rad.limitMsv} mSv limit)
            {rad.projectedMsv !== null && `, ${rad.projectedMsv} mSv projected at arrival (${projPct}%)`}.
          </li>
        </ul>
      </Section>

      <Section id="report-changes" title="Status changes" meta={`${report.events.length} this ${period}`}>
        {report.events.length ? (
          <ol className={s.events}>
            {report.events.map((e) => (
              <li key={`${e.day}-${e.metricId}-${e.to}`}>
                <span className={s.eventDay}>{e.day === report.missionDay ? 'Today' : `Day ${e.day}`}</span>
                <span className={s.eventLabel}>{e.label}</span>
                <span className={s.eventMove}>
                  <span className={ui.caption}>{LEVEL_WORD[e.from]}</span>
                  <span aria-label="to" className={ui.caption}>
                    →
                  </span>
                  <StatusBadge level={e.to} label={LEVEL_WORD[e.to]} />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={`${ui.small} ${ui.muted}`}>No Watch or Alert this {period}.</p>
        )}
      </Section>

      <Section id="report-ribbon" title="Zones by day" meta="▲ Watch · ◆ Alert · hatched: no check-in">
        <ZoneRibbon report={report} />
      </Section>

      <section className={ui.section} aria-labelledby="report-trends">
        <div className={ui.sectionHead}>
          <h2 id="report-trends" className={ui.h2}>
            Trends
          </h2>
          <span className={ui.sectionMeta}>Shaded band: your usual range. Hover a point for its value.</span>
        </div>
        <div className={s.trends}>
          {sorted.map((m) => (
            <TrendCard key={m.id} m={m} period={period} lastDay={report.missionDay} onWhy={actions.onWhy} />
          ))}
        </div>
      </section>

      <Section id="report-rad" title="Radiation" aside={<StatusBadge level={radLevel} label={LEVEL_WORD[radLevel]} />}>
        <p className={s.radBig}>
          {rad.careerMsv}
          <span className={ui.unit}>
            of {rad.limitMsv} mSv career limit ({radPct}%)
          </span>
        </p>
        <BudgetBar r={rad} />
        <h3 className={s.subhead}>Daily dose (mSv)</h3>
        <DoseChart r={rad} lastDay={report.missionDay} />
        <p className={ui.caption}>The app records dosimeter readings; it does not measure radiation. Limit: NASA-STD-3001 Vol. 1.</p>
      </Section>
    </section>
  )
}

/** A titled section whose content sits in one card. */
function Section({ id, title, meta, aside, children }: { id: string; title: string; meta?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={ui.section} aria-labelledby={id}>
      <div className={ui.sectionHead}>
        <h2 id={id} className={ui.h2}>
          {title}
        </h2>
        {meta && <span className={ui.sectionMeta}>{meta}</span>}
        {aside}
      </div>
      <div className={`${ui.card} ${s.panel}`}>{children}</div>
    </section>
  )
}

function Kpi({ label, value, unit, level }: { label: string; value: number; unit: string; level?: Level }) {
  return (
    <div className={`${ui.card} ${s.kpi} ${level && isFlagged(level) ? s[level] : ''}`}>
      <span className={ui.caption}>{label}</span>
      <span className={s.kpiValue}>
        {value}
        <span className={ui.unit}>{unit}</span>
      </span>
    </div>
  )
}

function TrendCard({ m, period, lastDay, onWhy }: { m: ReportMetric; period: string; lastDay: number; onWhy?: (id: string) => void }) {
  const flagged = isFlagged(m.level)
  const change = changeText(m, period)
  const usual = m.usual ? `Your usual ${m.usual[0].toFixed(m.decimals)}–${m.usual[1].toFixed(m.decimals)}${m.unit.startsWith('/') ? '' : ` ${m.unit}`}` : 'Rule-based: no personal band'
  return (
    <article className={`${ui.card} ${s.trendCard} ${flagged ? s[m.level] : ''}`} aria-label={`${m.label}${flagged ? `, ${LEVEL_WORD[m.level]}` : ''}`}>
      <header className={s.trendHead}>
        <ZoneIcon zone={m.zone} className={s.rowIcon} />
        <span className={ui.h3}>{m.label}</span>
        {flagged && <StatusBadge level={m.level} label={LEVEL_WORD[m.level]} />}
      </header>
      <div>
        <p className={s.trendValue}>
          {m.avg === null ? '—' : m.avg.toFixed(m.decimals)}
          <span className={ui.unit}>{m.unit} average</span>
        </p>
        {change && <p className={ui.caption}>{change}</p>}
      </div>
      <TrendChart m={m} lastDay={lastDay} />
      <footer className={s.trendFoot}>
        <span className={ui.caption}>{usual}</span>
        {flagged && (
          <button type="button" className={ui.btnText} onClick={() => onWhy?.(m.id)}>
            Why?
          </button>
        )}
      </footer>
    </article>
  )
}
