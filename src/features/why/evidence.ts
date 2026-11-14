import type { Level, Reading, ReportMetric } from '../today/model.ts'

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
}

export function fromReading(r: Reading): WhyEvidence {
  const trend = r.trend ?? (r.value === null ? [] : [r.value])
  return { id: r.id, label: r.label, unit: r.unit, decimals: r.decimals, level: r.level, usual: r.usual, note: r.note, points: trend.map((value) => ({ value })) }
}

export function fromReportMetric(m: ReportMetric): WhyEvidence {
  return {
    id: m.id, label: m.label, unit: m.unit, decimals: m.decimals, level: m.level, usual: m.usual,
    points: m.points.flatMap((p) => (p.value === null ? [] : [{ day: p.day, value: p.value, level: p.level }])),
  }
}

/** Plain-language reason, e.g. "Latest 38.4 °C is 1.3 °C above your usual range 36.7–37.1 °C." */
export function whySentence(e: WhyEvidence): string {
  const last = e.points.at(-1)?.value
  const f = (n: number) => n.toFixed(e.decimals)
  const unit = e.unit.startsWith('/') ? e.unit : ` ${e.unit}`
  if (last === undefined) return 'There is no reading yet, so nothing can be compared.'
  if (!e.usual) return `Latest ${f(last)}${unit}. This metric is checked against a fixed rule, not a personal range.`
  const [lo, hi] = e.usual
  const range = `your usual range ${f(lo)}–${f(hi)}${unit}`
  if (last > hi) return `Latest ${f(last)}${unit} is ${f(last - hi)}${unit} above ${range}.`
  if (last < lo) return `Latest ${f(last)}${unit} is ${f(lo - last)}${unit} below ${range}.`
  return `Latest ${f(last)}${unit} is inside ${range}.`
}
