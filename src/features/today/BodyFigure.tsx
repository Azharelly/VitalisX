import { LEVEL_WORD, isFlagged, type Level, type ZoneId } from './model'
import { StatusIcon } from './StatusIcon'
import s from './today.module.css'

// Pin positions in % of the figure box (viewBox 200 × 460), so they stay locked at any size.
// Immune, Metabolism and Radiation have no body location: they live in the zone list beside the figure.
const PINS: { id: ZoneId; label: string; left: number; top: number }[] = [
  { id: 'mind', label: 'Mind', left: 50, top: 1.7 },
  { id: 'eyes', label: 'Eyes', left: 50, top: 11.7 },
  { id: 'heart', label: 'Heart', left: 56, top: 27.8 },
  { id: 'bone', label: 'Bones', left: 41, top: 69 },
]

interface Props {
  levels: Record<ZoneId, Level>
  selected: ZoneId | null
  onSelect: (z: ZoneId) => void
}

// shortcut: one neutral flat figure; the F/M (muscle-style, 2D) drawings replace the <svg> when the art is ready.
export function BodyFigure({ levels, selected, onSelect }: Props) {
  return (
    <div className={s.figure}>
      <svg viewBox="0 0 200 460" className={s.body} aria-hidden="true">
        <g fill="var(--body)" stroke="var(--body)" strokeLinecap="round">
          <ellipse cx="100" cy="46" rx="24" ry="30" stroke="none" />
          <rect x="91" y="70" width="18" height="24" rx="6" stroke="none" />
          <path d="M58 98 Q100 86 142 98 Q150 150 140 200 Q135 228 138 252 L62 252 Q65 228 60 200 Q50 150 58 98 Z" stroke="none" />
          <path d="M60 106 Q42 170 38 282" fill="none" strokeWidth="20" />
          <path d="M140 106 Q158 170 162 282" fill="none" strokeWidth="20" />
          <path d="M82 246 Q81 340 80 438" fill="none" strokeWidth="30" />
          <path d="M118 246 Q119 340 120 438" fill="none" strokeWidth="30" />
        </g>
      </svg>
      {PINS.map((p) => {
        const level = levels[p.id]
        const flagged = isFlagged(level)
        return (
          <button
            key={p.id}
            type="button"
            className={`${s.pin} ${flagged ? s[level] : ''}`}
            style={{ left: `${p.left}%`, top: `${p.top}%` }}
            aria-pressed={selected === p.id}
            aria-label={`${p.label}: ${LEVEL_WORD[level]}`}
            onClick={() => onSelect(p.id)}
          >
            <span className={s.pinDot}>{flagged ? <StatusIcon level={level} /> : <span className={s.neutralDot} />}</span>
            <span className={s.pinLabel}>
              {p.label}
              {flagged && ` · ${LEVEL_WORD[level]}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
