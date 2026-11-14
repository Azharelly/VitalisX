import type { Reading } from './model'
import s from './today.module.css'

// Shared y-domain: the usual band always sits in view, padded so the band never touches the edges.
function domain(r: Reading): [number, number] {
  const vals = [...(r.trend ?? []), ...(r.value === null ? [] : [r.value]), ...(r.usual ?? [])]
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (r.usual && hi - lo < (r.usual[1] - r.usual[0]) * 3) {
    const mid = (r.usual[0] + r.usual[1]) / 2
    const half = ((r.usual[1] - r.usual[0]) * 3) / 2
    lo = Math.min(lo, mid - half)
    hi = Math.max(hi, mid + half)
  }
  const pad = (hi - lo || 1) * 0.12
  return [lo - pad, hi + pad]
}

/** Last readings against the person's usual band. Decorative: the card text carries the numbers. */
export function Sparkline({ r }: { r: Reading }) {
  const t = r.trend
  if (!t || t.length < 2) return null
  const W = 180
  const H = 56
  const [lo, hi] = domain(r)
  const x = (i: number) => 4 + (i * (W - 8)) / (t.length - 1)
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo)) * (H - 8)
  const pts = t.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const last = t.length - 1
  return (
    <svg className={s.spark} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {r.usual && <rect className={s.sparkBand} x="0" width={W} y={y(r.usual[1])} height={y(r.usual[0]) - y(r.usual[1])} rx="3" />}
      <polyline className={s.sparkLine} points={pts} />
      <circle className={s.sparkDot} cx={x(last)} cy={y(t[last])} r="4" />
    </svg>
  )
}

/** Where today's value sits in the usual band (band = middle third of the track). */
export function RangeBar({ r }: { r: Reading }) {
  if (!r.usual || r.value === null) return null
  const [lo, hi] = r.usual
  const span = hi - lo || 1
  const pos = Math.min(100, Math.max(0, ((r.value - (lo - span)) / (span * 3)) * 100))
  return (
    <span className={s.range} aria-hidden="true">
      <span className={s.rangeBand} />
      <span className={s.rangeDot} style={{ left: `${pos}%` }} />
    </span>
  )
}
