import { useState } from 'react'
import { WhyModal } from '../why/WhyModal'
import { fromReportMetric } from '../why/evidence.ts'
import { ZONES, LEVEL_WORD, changeText, isFlagged, type Level, type ReportMetric, type ReportView } from '../today/model.ts'
import type { OutboxPort, SendToEarth } from '../../data/outbox'
import { StatusIcon } from '../today/StatusIcon'
import { ZoneIcon } from '../today/ZoneIcon'
import { BudgetBar, DoseChart, TrendChart, ZoneRibbon } from './ReportCharts'
import { SbarDialog } from './SbarDialog'
import { LEVEL_RANK as RANK, openItems as getOpenItems, percentOf, radiationLevel } from './summary.ts'
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

/** Where SBAR summaries go. Without `outbox` the button only emits `onSendSummary`. */
export interface ReportOutbox {
  outbox?: OutboxPort
  /** Delivery to Earth; omitted = messages stay queued until something sends them. */
  send?: SendToEarth
  /** One-way communication delay in seconds, shown to the crew. */
  commsDelaySec?: number
}

const ZONE_ORDER = ZONES.map((z) => z.id)

/** Week or month in review for one crew member. Presentational: data in, callbacks out. */
export function ReportScreen({ report, outbox, send, commsDelaySec, ...actions }: { report: ReportView } & ReportActions & ReportOutbox) {
  const [whyId, setWhyId] = useState<string | null>(null)
  const [sbarOpen, setSbarOpen] = useState(false)
  const why = report.metrics.find((m) => m.id === whyId)
  const onWhy = (metricId: string) => {
    setWhyId(metricId)
    actions.onWhy?.(metricId)
  }
  const period = report.days === 7 ? 'week' : 'month'
  const first = report.zones[0]?.day ?? report.missionDay
  const span = report.missionDay - first + 1 // shorter than the period early in the mission
  const sorted = [...report.metrics].sort(
    (a, b) => RANK[a.level] - RANK[b.level] || ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone) || a.priority - b.priority,
  )
  const rad = report.radiation
  const radPct = percentOf(rad.careerMsv, rad.limitMsv)
  const projPct = rad.projectedMsv === null ? null : percentOf(rad.projectedMsv, rad.limitMsv)
  const radLevel: Level = radiationLevel(rad)
  // Everything still Watch / Alert on the last day, radiation included (it is not in `metrics`).
  const openItems = getOpenItems(report)
  const sendSummary = () => {
    if (outbox) setSbarOpen(true)
    actions.onSendSummary?.(report.person.id, report.days)
  }

  return (
    <section className={s.root} aria-labelledby="report-title">
      <div className={s.topBar}>
        {actions.onBack ? (
          <button type="button" className={s.backBtn} onClick={actions.onBack}>
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

      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>
            Report · {report.person.name} · {report.person.role}
          </p>
          <h1 id="report-title" className={s.title}>
            Your {period} in review
          </h1>
          <p className={s.muted}>
            {first === report.missionDay ? `Mission day ${first}` : `Mission days ${first}–${report.missionDay}`}
            {report.isSimulated && <span className={s.sim}>Simulated data</span>}
          </p>
        </div>
        <button type="button" className={s.sendBtn} onClick={sendSummary}>
          Send summary to Earth
        </button>
      </header>

      <div className={s.kpis}>
        <Kpi label="Days logged" value={report.logged} suffix={`of ${span}`} />
        <Kpi label="Check-in streak" value={report.streakDays} suffix={report.streakDays === 1 ? 'day' : 'days'} />
        <Kpi label="Open now" value={openItems.length} suffix={openItems.length === 1 ? 'item' : 'items'} level={openItems[0]?.level} />
        <Kpi label="Career dose" value={radPct} suffix={`% of ${rad.limitMsv} mSv`} level={radLevel} />
      </div>

      <section className={s.panel} aria-labelledby="report-summary">
        <h2 id="report-summary" className={s.h2}>
          Summary
        </h2>
        <ul className={s.summary}>
          <li>
            {report.logged} of {span} days logged{report.streakDays > 1 ? `; ${report.streakDays}-day check-in streak.` : '.'}
          </li>
          <li>
            {openItems.length
              ? `Open now: ${openItems.map((m) => `${m.label} (${LEVEL_WORD[m.level]})`).join(', ')}.`
              : `Every reading ended the ${period} normal for you.`}
          </li>
          <li>
            Radiation: {rad.careerMsv} mSv ({radPct}% of {rad.limitMsv})
            {rad.projectedMsv !== null && `, ${rad.projectedMsv} mSv projected at arrival (${projPct}%)`}.
          </li>
        </ul>
      </section>

      <section className={s.panel} aria-labelledby="report-changes">
        <h2 id="report-changes" className={s.h2}>
          What changed
        </h2>
        {report.events.length ? (
          <ol className={s.events}>
            {report.events.map((e) => (
              <li key={`${e.day}-${e.metricId}-${e.to}`}>
                <span className={s.eventDay}>{e.day === report.missionDay ? 'Today' : `Day ${e.day}`}</span>
                <span className={s.eventLabel}>{e.label}</span>
                <span className={`${s.eventLevel} ${s[e.from]}`}>{LEVEL_WORD[e.from]}</span>
                <span aria-hidden="true" className={s.muted}>
                  →
                </span>
                <span className={`${s.eventLevel} ${s[e.to]}`}>
                  {isFlagged(e.to) && <StatusIcon level={e.to} />}
                  {LEVEL_WORD[e.to]}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={s.muted}>
            No status changes this {period}.{openItems.length > 0 && ` Still open: ${openItems.map((m) => m.label).join(', ')}.`}
          </p>
        )}
      </section>

      <section className={s.panel} aria-labelledby="report-ribbon">
        <h2 id="report-ribbon" className={s.h2}>
          Zones by day
        </h2>
        <ZoneRibbon report={report} />
      </section>

      <section aria-labelledby="report-trends">
        <h2 id="report-trends" className={s.h2}>
          Trends <span className={s.hint}>Shaded band = your usual range · hover a point for its value</span>
        </h2>
        <div className={s.trends}>
          {sorted.map((m) => (
            <TrendCard key={m.id} m={m} period={period} lastDay={report.missionDay} onWhy={onWhy} />
          ))}
        </div>
      </section>

      <section className={s.panel} aria-labelledby="report-rad">
        <div className={s.radHead}>
          <h2 id="report-rad" className={s.h2}>
            <ZoneIcon zone="radiation" className={s.rowIcon} /> Radiation
          </h2>
          <span className={`${s.badge} ${s[radLevel]}`}>
            <StatusIcon level={radLevel} /> {LEVEL_WORD[radLevel]}
          </span>
        </div>
        <p className={s.radBig}>
          {rad.careerMsv}
          <span className={s.unit}>
            of {rad.limitMsv} mSv career limit · {radPct}%
          </span>
        </p>
        <BudgetBar r={rad} />
        <h3 className={s.h3}>Daily dose · mSv</h3>
        <DoseChart r={rad} lastDay={report.missionDay} />
        <p className={s.fine}>The app records dosimeter readings; it does not measure radiation. Limit: NASA-STD-3001 Vol. 1.</p>
      </section>
      {sbarOpen && outbox && (
        <SbarDialog report={report} outbox={outbox} send={send} commsDelaySec={commsDelaySec} onClose={() => setSbarOpen(false)} />
      )}
      {why && <WhyModal e={fromReportMetric(why)} onClose={() => setWhyId(null)} />}
    </section>
  )
}

function Kpi({ label, value, suffix, level }: { label: string; value: number; suffix: string; level?: Level }) {
  const tone = level && isFlagged(level) ? s[level] : ''
  return (
    <div className={`${s.kpi} ${tone}`}>
      <span className={s.eyebrow}>{label}</span>
      <span className={s.kpiValue}>
        {value}
        <span className={s.unit}>{suffix}</span>
      </span>
    </div>
  )
}

function TrendCard({ m, period, lastDay, onWhy }: { m: ReportMetric; period: string; lastDay: number; onWhy?: (id: string) => void }) {
  const flagged = isFlagged(m.level)
  const change = changeText(m, period)
  return (
    <article className={`${s.trendCard} ${flagged ? s[m.level] : ''}`}>
      <header className={s.trendHead}>
        <ZoneIcon zone={m.zone} className={s.rowIcon} />
        <span className={s.trendLabel}>{m.label}</span>
        {flagged && (
          <span className={s.badge}>
            <StatusIcon level={m.level} /> {LEVEL_WORD[m.level]}
          </span>
        )}
      </header>
      <p className={s.trendValue}>
        {m.avg === null ? '—' : m.avg.toFixed(m.decimals)}
        <span className={s.unit}>{m.unit} average</span>
      </p>
      {change && <p className={s.change}>{change}</p>}
      <TrendChart m={m} lastDay={lastDay} />
      <div className={s.trendFoot}>
        <span className={s.muted}>{m.usual ? `Usual ${m.usual[0].toFixed(m.decimals)}–${m.usual[1].toFixed(m.decimals)} ${m.unit}` : m.level === 'learn' ? 'Learning your normal' : 'Rule-based, no personal band'}</span>
        {flagged && (
          <button type="button" className={s.why} onClick={() => onWhy?.(m.id)}>
            Why?
          </button>
        )}
      </div>
    </article>
  )
}
