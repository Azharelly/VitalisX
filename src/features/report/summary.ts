// Shared by the Report page and the SBAR draft, so both always agree on what is "open now".
import { isFlagged, type Level, type ReportView } from '../today/model.ts'

export const LEVEL_RANK: Record<Level, number> = { alert: 0, watch: 1, learn: 2, ok: 3, none: 4 }

export const percentOf = (part: number, whole: number) => Math.round((part / whole) * 100)

/** Radiation status for the report. Radiation is not in `metrics`; the Watch rule (80% projected) is the simulation's placeholder (PRD R-15). */
export function radiationLevel(rad: ReportView['radiation']): Level {
  if (rad.noData) return 'none'
  const pct = percentOf(rad.projectedMsv ?? rad.careerMsv, rad.limitMsv)
  return rad.daily.at(-1)?.storm || pct >= 100 ? 'alert' : pct >= 80 ? 'watch' : 'ok'
}

export interface OpenItem {
  id: string
  label: string
  level: Level
  zone: string
}

/** Everything still Watch / Alert on the last day, radiation included, most urgent first. */
export function openItems(report: ReportView): OpenItem[] {
  const metrics = report.metrics
    .filter((m) => isFlagged(m.level))
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.priority - b.priority)
    .map((m) => ({ id: m.id, label: m.label, level: m.level, zone: m.zone }))
  const radLevel = radiationLevel(report.radiation)
  const rad: OpenItem[] = isFlagged(radLevel) ? [{ id: 'radiation', label: 'Career dose', level: radLevel, zone: 'radiation' }] : []
  return [...metrics, ...rad].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])
}
