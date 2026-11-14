import { CAREER_LIMIT_MSV } from '../../engine/radiation'
import type { FrozenEvidence, Level, Reading, ReportMetric, ReportView } from '../today/model.ts'

/** Everything the Why? modal shows for one metric, whichever screen opened it. */
export interface WhyEvidence {
  id: string
  label: string
  unit: string
  decimals: number
  level: Level
  usual?: [number, number]
  /** Readings, oldest first. `day` is the mission day when known. */
  points: { day?: number; value: number; level?: Level }[]
  note?: string
  /**
   * Set when `points` / `usual` are the snapshot stored on the day the alert was raised (F-05): they do not change
   * when newer readings arrive. Absent = live readings, because no snapshot is stored for this alert.
   */
  frozen?: { raisedDay: number }
  /** Today's latest reading, shown apart from frozen evidence so the two are never mixed. */
  latest?: number
}

function fromFrozen(base: Omit<WhyEvidence, 'points' | 'usual' | 'frozen' | 'latest'>, a: FrozenEvidence, latest: number | null): WhyEvidence {
  return {
    ...base,
    usual: a.usual,
    points: a.points.map((value) => ({ value })),
    frozen: { raisedDay: a.raisedDay },
    latest: latest ?? undefined,
  }
}

export function fromReading(r: Reading): WhyEvidence {
  const base = { id: r.id, label: r.label, unit: r.unit, decimals: r.decimals, level: r.level, note: r.note }
  if (r.alert) return fromFrozen(base, r.alert, r.value)
  const trend = r.trend ?? (r.value === null ? [] : [r.value])
  return { ...base, usual: r.usual, points: trend.map((value) => ({ value })) }
}

export function fromReportMetric(m: ReportMetric): WhyEvidence {
  const base = { id: m.id, label: m.label, unit: m.unit, decimals: m.decimals, level: m.level }
  const last = m.points.findLast((p) => p.value !== null)?.value ?? null
  if (m.alert) return fromFrozen(base, m.alert, last)
  return {
    ...base,
    usual: m.usual,
    points: m.points.flatMap((p) => (p.value === null ? [] : [{ day: p.day, value: p.value, level: p.level }])),
  }
}

/** Career dose from the Report's radiation panel (radiation is not in `metrics`). */
export function fromReportRadiation(report: ReportView, level: Level): WhyEvidence {
  const rad = report.radiation
  const base = {
    id: 'rad', label: 'Career dose', unit: 'mSv', decimals: 0, level,
    note: `${Math.round((rad.careerMsv / rad.limitMsv) * 100)}% of the ${rad.limitMsv} mSv limit${
      rad.projectedMsv === null ? '' : ` · ${rad.projectedMsv} mSv projected at arrival`
    }`,
  }
  if (rad.alert) return fromFrozen(base, rad.alert, rad.careerMsv)
  // No stored snapshot: rebuild the career total day by day from the period's daily doses (live).
  let total = rad.careerMsv
  const points = [...rad.daily].reverse().map((d) => {
    const p = { day: d.day, value: Number(total.toFixed(1)) }
    total -= d.msv
    return p
  }).reverse()
  return { ...base, points }
}

const TRIM = (n: number, d: number) => n.toFixed(d)

/** Plain-language reason, e.g. "Latest 38.4 °C is 1.3 °C above your usual range 36.7–37.1 °C." */
export function whySentence(e: WhyEvidence): string {
  const last = e.points.at(-1)?.value
  const f = (n: number) => TRIM(n, e.decimals)
  const unit = e.unit.startsWith('/') ? e.unit : ` ${e.unit}`
  const word = e.frozen ? `On day ${e.frozen.raisedDay} the reading` : 'Latest'
  if (last === undefined) return 'There is no reading yet, so nothing can be compared.'
  if (e.id === 'rad') return `${e.frozen ? `On day ${e.frozen.raisedDay} the career dose` : 'Career dose'} was ${f(last)} mSv, against the ${CAREER_LIMIT_MSV} mSv career limit (NASA-STD-3001 Vol. 1).`
  if (!e.usual) return `${word} ${f(last)}${unit}. This metric is checked against a fixed rule, not a personal range.`
  const [lo, hi] = e.usual
  const range = `your usual range ${f(lo)}–${f(hi)}${unit}`
  const is = e.frozen ? 'was' : 'is'
  if (last > hi) return `${word} ${f(last)}${unit} ${is} ${f(last - hi)}${unit} above ${range}.`
  if (last < lo) return `${word} ${f(last)}${unit} ${is} ${f(lo - last)}${unit} below ${range}.`
  return `${word} ${f(last)}${unit} ${is} inside ${range}.`
}
