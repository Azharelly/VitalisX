// shortcut: local view-model types until src/data/types.ts lands; then import State/Zone from there
// (Level mirrors types.ts State names so the swap is a rename-free import).
export type Level = 'ok' | 'watch' | 'alert' | 'learn' | 'none'
export type ZoneId = 'mind' | 'eyes' | 'heart' | 'bone' | 'immune' | 'meta' | 'radiation'

export interface Reading {
  id: string
  label: string
  zone: ZoneId
  value: number | null
  unit: string
  decimals: number
  level: Level
  priority: number // 1 = most urgent (metric.priority)
  usual?: [number, number] // personal normal band; absent while learning or for rule-only metrics
  trend?: number[] // recent readings, oldest first, last = value
  context?: string
  measured?: string // already formatted with the mission clock
  note?: string
  action?: string // next step, only on watch/alert
}

export interface TodayView {
  person: { name: string; role: string }
  missionDay: number
  isSimulated: boolean // drives the "Simulated data" label (PRD: is_simulated)
  nextAction: { text: string; metricId?: string } // the engine picks exactly one
  readings: Reading[]
}

export const ZONES: { id: ZoneId; label: string }[] = [
  { id: 'mind', label: 'Mind & sleep' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'heart', label: 'Heart' },
  { id: 'bone', label: 'Bones & muscle' },
  { id: 'immune', label: 'Immune' },
  { id: 'meta', label: 'Metabolism' },
  { id: 'radiation', label: 'Radiation' },
]

export const LEVEL_WORD: Record<Level, string> = {
  alert: 'Alert',
  watch: 'Watch',
  learn: 'Learning',
  ok: 'Normal',
  none: 'No data',
}

const RANK: Record<Level, number> = { alert: 0, watch: 1, learn: 2, ok: 3, none: 4 }

export const worst = (levels: Level[]): Level =>
  levels.reduce<Level>((w, l) => (RANK[l] < RANK[w] ? l : w), 'none')

export const isFlagged = (l: Level) => l === 'alert' || l === 'watch'

export const byAttention = (a: Reading, b: Reading) =>
  RANK[a.level] - RANK[b.level] || a.priority - b.priority

export const formatValue = (r: Reading) => (r.value === null ? '—' : r.value.toFixed(r.decimals))

// "+0.9 °C above your usual" style text; null when inside the band or nothing to compare.
export function deviation(r: Reading): string | null {
  if (r.value === null || !r.usual) return null
  const [lo, hi] = r.usual
  if (r.value > hi) return `${(r.value - hi).toFixed(r.decimals)} ${r.unit} above your usual`
  if (r.value < lo) return `${(lo - r.value).toFixed(r.decimals)} ${r.unit} below your usual`
  return null
}
