import { useState, type CSSProperties } from 'react'
import { LEVEL_WORD, ZONES, isFlagged, type Level, type ReportMetric, type ReportView } from '../today/model.ts'
import { StatusIcon } from '../today/StatusIcon'
import { ZoneIcon } from '../today/ZoneIcon'
import s from './report.module.css'

// Hand-drawn SVG charts (no chart dependency). Each one has a text alternative; the SVG itself is a picture of it.

const dayLabel = (day: number, last: number) => (day === last ? 'Today' : `D${day}`)

/** A metric over the period: usual band, one point per day coloured by status, gaps for missing days. */
export function TrendChart({ m, lastDay }: { m: ReportMetric; lastDay: number }) {
  const [active, setActive] = useState<number | null>(null) // the day being read: phones cannot hover a <title>
  const W = 320
  const H = 150
  const L = 38
  const R = 10
  const T = 10
  const B = 24
  const vals = m.points.flatMap((p) => (p.value === null ? [] : [p.value]))
  if (!vals.length) return <p className={s.noData}>No readings in this period.</p>

  let lo = Math.min(...vals, ...(m.usual ?? []))
  let hi = Math.max(...vals, ...(m.usual ?? []))
  const pad = (hi - lo || 1) * 0.15
  lo -= pad
  hi += pad
  const n = m.points.length
  const x = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1))
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const fmt = (v: number) => v.toFixed(m.decimals)

  // Break the line where a day has no reading.
  let d = ''
  m.points.forEach((p, i) => {
    if (p.value === null) return
    const prev = m.points[i - 1]
    d += `${!prev || prev.value === null ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)} `
  })
  const ticks = m.usual ? m.usual : [Math.min(...vals), Math.max(...vals)]
  const xTicks = n > 10 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1]

  const step = n > 1 ? (W - L - R) / (n - 1) : W - L - R
  const shown = active === null ? null : m.points[active]

  return (
    <>
    <svg className={s.trend} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${m.label} over ${n} days: ${vals.map(fmt).join(', ')} ${m.unit}`}>
      {m.usual && (
        <rect className={s.band} x={L} width={W - L - R} y={y(m.usual[1])} height={Math.max(2, y(m.usual[0]) - y(m.usual[1]))} rx="3" />
      )}
      {ticks.map((v, i) => (
        <g key={i}>
          <line className={s.grid} x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
          <text className={s.axis} x={L - 6} y={y(v) + 4} textAnchor="end">
            {fmt(v)}
          </text>
        </g>
      ))}
      {xTicks.map((i) => (
        <text key={i} className={s.axis} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
          {dayLabel(m.points[i].day, lastDay)}
        </text>
      ))}
      <path className={s.line} d={d} />
      {m.points.map((p, i) =>
        p.value === null ? null : (
          <circle
            key={p.day}
            className={`${s.dot} ${isFlagged(p.level) ? s[p.level] : ''} ${i === n - 1 ? s.dotLast : ''}`}
            cx={x(i)}
            cy={y(p.value)}
            r={isFlagged(p.level) || i === n - 1 ? 4.5 : 2.8}
          >
            <title>{`Day ${p.day}: ${fmt(p.value)} ${m.unit} · ${LEVEL_WORD[p.level]}`}</title>
          </circle>
        ),
      )}
      {shown && shown.value !== null && (
        <circle className={s.dotActive} cx={x(active!)} cy={y(shown.value)} r="7" aria-hidden="true" />
      )}
      {/* One invisible column per day: tap (phones) or hover (mouse) reads that day below the chart. */}
      {m.points.map((p, i) =>
        p.value === null ? null : (
          <rect
            key={`hit-${p.day}`}
            className={s.hit}
            x={x(i) - step / 2}
            width={step}
            y={0}
            height={H}
            onPointerEnter={() => setActive(i)}
            onClick={() => setActive(i)}
          />
        ),
      )}
    </svg>
    <p className={s.readout} aria-hidden="true">
      {shown && shown.value !== null
        ? `${shown.day === lastDay ? 'Today' : `Day ${shown.day}`} · ${fmt(shown.value)} ${m.unit} · ${LEVEL_WORD[shown.level]}`
        : 'Tap the chart to read a day'}
    </p>
    </>
  )
}

/** Daily dosimeter readings; storm days in red; dashed line = period average. HTML bars so it fits any width. */
export function DoseChart({ r, lastDay }: { r: ReportView['radiation']; lastDay: number }) {
  const n = r.daily.length
  const max = Math.max(...r.daily.map((d) => d.msv), 1) * 1.15
  const avg = r.daily.reduce((a, d) => a + d.msv, 0) / n
  const storms = r.daily.filter((d) => d.storm)
  const pct = (v: number) => `${(v / max) * 100}%`
  return (
    <div
      className={s.dose}
      role="img"
      aria-label={`Daily dose over ${n} days, average ${avg.toFixed(2)} mSv per day${storms.length ? `, solar storm on day ${storms.map((d) => d.day).join(', ')}` : ''}`}
    >
      <div className={s.doseAxis} aria-hidden="true">
        <span>{(max / 1.15).toFixed(1)}</span>
        <span>0</span>
      </div>
      <div className={s.doseBars} style={{ '--avg': pct(avg) } as CSSProperties}>
        {r.daily.map((d) => (
          <span key={d.day} className={`${s.doseBar} ${d.storm ? s.barStorm : ''}`} style={{ height: pct(d.msv) }} title={`Day ${d.day}: ${d.msv.toFixed(2)} mSv${d.storm ? ' · solar particle event' : ''}`} />
        ))}
      </div>
      <div className={s.doseX} aria-hidden="true">
        <span>{dayLabel(r.daily[0].day, lastDay)}</span>
        <span>avg {avg.toFixed(2)} mSv/day{storms.length ? ` · storm: day ${storms.map((d) => d.day).join(', ')}` : ''}</span>
        <span>{dayLabel(r.daily[n - 1].day, lastDay)}</span>
      </div>
    </div>
  )
}

/** Career dose budget: earlier missions, this mission, projection, with 80% and 100% marks. */
export function BudgetBar({ r }: { r: ReportView['radiation'] }) {
  const scale = Math.max(r.limitMsv * 1.2, (r.projectedMsv ?? r.careerMsv) * 1.05)
  const pc = (v: number) => `${(v / scale) * 100}%`
  const mission = r.careerMsv - r.priorMsv
  // Same thresholds as the radiation rule: Watch from 80% of the limit, Alert at the limit.
  const levelOf = (msv: number): Level => (msv >= r.limitMsv ? 'alert' : msv >= 0.8 * r.limitMsv ? 'watch' : 'ok')
  const now = levelOf(r.careerMsv) // colours earlier missions (darker) and this mission
  const ahead = r.projectedMsv === null ? null : levelOf(r.projectedMsv) // colours the projection
  return (
    <div className={s.budget}>
      <div
        className={s.budgetTrack}
        role="img"
        aria-label={`${r.careerMsv} of ${r.limitMsv} mSv career limit, ${LEVEL_WORD[now]}${r.projectedMsv === null ? '' : `; ${r.projectedMsv} projected at arrival, ${LEVEL_WORD[ahead!]}`}`}
      >
        <span className={`${s.segPrior} ${s[now]}`} style={{ left: 0, width: pc(r.priorMsv) }} />
        <span className={`${s.segMission} ${s[now]}`} style={{ left: pc(r.priorMsv), width: pc(mission) }} />
        {r.projectedMsv !== null && (
          <span className={`${s.segProjected} ${s[ahead!]}`} style={{ left: pc(r.careerMsv), width: pc(r.projectedMsv - r.careerMsv) }} />
        )}
        <span className={s.tick} style={{ left: pc(r.limitMsv * 0.8) }} />
        <span className={`${s.tick} ${s.tickLimit}`} style={{ left: pc(r.limitMsv) }} />
      </div>
      <div className={s.budgetLegend}>
        <span><i className={`${s.segPrior} ${s[now]}`} /> Earlier missions {r.priorMsv} mSv</span>
        <span><i className={`${s.segMission} ${s[now]}`} /> This mission {mission} mSv · {LEVEL_WORD[now]}</span>
        {r.projectedMsv !== null && (
          <span><i className={`${s.segProjected} ${s[ahead!]}`} /> Projected {r.projectedMsv} mSv by day {r.arrivalDay} · {LEVEL_WORD[ahead!]}</span>
        )}
        <span><i className={s.tickKey} /> Marks: 80% and {r.limitMsv} mSv limit</span>
      </div>
    </div>
  )
}

/** Zone × day status ribbon. Colour always comes with a shape for Watch/Alert. */
export function ZoneRibbon({ report }: { report: ReportView }) {
  const n = report.zones.length
  return (
    <div className={s.ribbonScroll}>
      <table className={s.ribbon} style={{ '--n': n } as CSSProperties}>
        <caption className={s.srOnly}>Status of each zone per day, days {report.zones[0]?.day} to {report.missionDay}</caption>
        <thead>
          <tr>
            <th scope="col">Zone</th>
            {report.zones.map((d, i) => (
              <th key={d.day} scope="col">
                {i === 0 || i === n - 1 || (n <= 7) || i % 7 === 0 ? dayLabel(d.day, report.missionDay) : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ZONES.map((z) => (
            <tr key={z.id}>
              <th scope="row">
                <ZoneIcon zone={z.id} className={s.rowIcon} />
                {z.label}
              </th>
              {report.zones.map((d) => {
                const l = d.zones?.[z.id]
                return (
                  <td key={d.day} title={`Day ${d.day}: ${l ? LEVEL_WORD[l] : 'no check-in'}`}>
                    <span className={`${s.cell} ${l ? s[l] : s.cellGap}`}>{l && isFlagged(l) && <StatusIcon level={l} />}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
