import { useId, type CSSProperties, type ReactNode } from 'react'
import { LEVEL_WORD, isFlagged, type Level, type Reading, type ZoneId } from './model'
import { StatusIcon } from './StatusIcon'
import { ZoneIcon } from './ZoneIcon'
import s from './today.module.css'

// Canvas 400 × 520; the 200 × 480 body is drawn at (100, 26), leaving headroom for the top callout. Markers and callouts use % of this
// same box, so they stay locked to the drawing at any size.
const W = 400
const H = 520
const BX = 100
const BY = 26

// Right half of the body (viewer's right), closed along the centre line and mirrored for the left.
const HALF =
  'M100 10 C113 10 121 21 121 37 C121 50 117 60 112 66 L111 82 C117 88 128 91 140 94 C152 97 160 106 161 120 ' +
  'C163 136 164 152 165 168 C166 186 168 202 168 216 C169 236 169 256 167 276 L166 296 C168 306 166 318 160 322 ' +
  'C155 324 151 316 151 306 L151 296 C150 276 150 256 149 238 C148 222 147 206 145 192 C143 176 142 160 141 148 ' +
  'C139 168 137 184 135 198 C134 212 137 228 140 244 C142 258 142 272 141 286 C139 314 136 340 133 362 ' +
  'C132 374 133 386 134 398 C135 418 132 436 128 452 C127 460 129 466 132 470 C133 475 126 477 116 476 ' +
  'C111 475 110 470 111 462 C112 446 112 430 112 414 C111 398 110 384 110 372 C109 346 106 318 103 292 ' +
  'C102 282 101 276 100 272 Z'

// Muscle groups (right half, mirrored): lighter planes give the 2D anatomical look.
const MUSCLES =
  'M102 104 C116 98 132 98 140 104 C143 116 141 126 138 132 C128 144 112 146 102 140 Z ' + // pectoral
  'M141 97 C153 100 160 108 160 122 C158 132 152 138 146 140 C146 124 145 110 141 97 Z ' + // deltoid
  'M147 144 C154 156 156 172 152 190 C148 178 146 160 147 144 Z ' + // biceps
  'M152 224 C160 238 163 256 161 274 C156 262 153 244 152 224 Z ' + // forearm
  'M103 150 H115 Q117 150 117 152 V161 Q117 163 115 163 H103 Z M103 168 H116 Q118 168 118 170 V183 Q118 185 116 185 H103 Z ' +
  'M103 190 H116 Q118 190 118 192 V206 Q118 208 116 208 H103 Z M103 213 H115 Q117 213 116 216 L113 232 Q112 235 109 236 H103 Z ' + // abs
  'M121 150 C127 170 132 190 134 205 C128 215 122 225 118 238 C120 210 121 180 121 150 Z ' + // oblique
  'M140 290 C140 316 134 340 126 358 C118 352 110 330 106 300 C112 290 126 284 140 290 Z ' + // quadriceps
  'M133 400 C134 418 131 432 127 446 C122 432 118 414 120 400 C124 394 130 394 133 400 Z' // calf

// Local auras (body coords): soft blurred glows over each zone, coloured by its status.
const LOCAL_AURAS: Partial<Record<ZoneId, ReactNode>> = {
  mind: <ellipse cx="100" cy="26" rx="26" ry="20" />,
  eyes: <ellipse cx="100" cy="46" rx="20" ry="7" />,
  heart: <circle cx="114" cy="134" r="18" />,
  meta: <ellipse cx="100" cy="206" rx="26" ry="24" />,
  bone: <path d="M78 290 L80 455 M122 290 L120 455 M45 125 Q37 205 40 300 M155 125 Q163 205 160 300" fill="none" strokeWidth="18" strokeLinecap="round" />,
}

// Marker point on the body (body coords) and the side its callout sits on.
const CALLOUTS: { id: ZoneId; label: string; ax: number; ay: number; side: 'left' | 'right' }[] = [
  { id: 'mind', label: 'Mind & sleep', ax: 100, ay: 6, side: 'left' },
  { id: 'eyes', label: 'Eyes', ax: 112, ay: 44, side: 'right' },
  { id: 'heart', label: 'Heart', ax: 114, ay: 134, side: 'right' },
  { id: 'bone', label: 'Bones & muscle', ax: 78, ay: 330, side: 'left' },
]
const LABEL_EDGE = { left: 112, right: 288 }
const pct = (v: number, of: number) => `${(v / of) * 100}%`

interface Props {
  levels: Record<ZoneId, Level>
  headline: Partial<Record<ZoneId, Reading>>
  selected: ZoneId | null
  onSelect: (z: ZoneId) => void
}

// shortcut: one neutral figure; F/M drawings slot in by swapping HALF/MUSCLES when the art is ready.
export function BodyFigure({ levels, headline, selected, onSelect }: Props) {
  const uid = useId()
  const half = `${uid}-half`
  const fill = `${uid}-fill`
  const blur = `${uid}-blur`
  const field = `${uid}-field`
  const mirror = 'translate(200 0) scale(-1 1)'

  return (
    <div className={s.figure}>
      <svg className={s.figureSvg} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <path id={half} d={HALF} />
          <linearGradient id={fill} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="480">
            <stop offset="0" stopColor="var(--body-top)" />
            <stop offset="1" stopColor="var(--body-bottom)" />
          </linearGradient>
          <filter id={blur} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <g transform={`translate(${BX} ${BY})`}>
          {/* Radiation: a field around the whole body (it is environmental, not one organ). */}
          <g className={`${s.aura} ${s.auraField} ${s[levels.radiation]} ${selected === 'radiation' ? s.auraOn : ''}`}>
            <radialGradient id={field} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.6" stopColor="currentColor" stopOpacity="0" />
              <stop offset="0.86" stopColor="currentColor" stopOpacity="0.55" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
            <ellipse cx="100" cy="244" rx="138" ry="246" fill={`url(#${field})`} />
            <ellipse className={s.fieldRing} cx="100" cy="244" rx="122" ry="226" fill="none" />
          </g>
          {/* Immune: a glow that hugs the silhouette (whole-body defence). */}
          <g className={`${s.aura} ${s[levels.immune]} ${selected === 'immune' ? s.auraOn : ''}`} filter={`url(#${blur})`} fill="none" stroke="currentColor" strokeWidth="12">
            <use href={`#${half}`} />
            <use href={`#${half}`} transform={mirror} />
          </g>
          {/* Rim: stroke both halves, then fill over them so the shared centre edge disappears. */}
          <g fill="none" stroke="var(--body-rim)" strokeWidth="2.5">
            <use href={`#${half}`} />
            <use href={`#${half}`} transform={mirror} />
          </g>
          <g fill={`url(#${fill})`}>
            <use href={`#${half}`} />
            <use href={`#${half}`} transform={mirror} />
            <rect x="99" y="14" width="2" height="258" />
          </g>
          <g className={s.muscles}>
            <path d={MUSCLES} />
            <path d={MUSCLES} transform={mirror} />
          </g>
          <g filter={`url(#${blur})`} fill="currentColor" stroke="currentColor">
            {(Object.keys(LOCAL_AURAS) as ZoneId[]).map((id) => (
              <g key={id} className={`${s.aura} ${s[levels[id]]} ${selected === id ? s.auraOn : ''}`}>
                {LOCAL_AURAS[id]}
              </g>
            ))}
          </g>
        </g>

        {CALLOUTS.map((c) => {
          const x = c.ax + BX
          const y = c.ay + BY
          const flagged = isFlagged(levels[c.id])
          return (
            <line
              key={c.id}
              className={`${s.leader} ${flagged ? s[levels[c.id]] : ''} ${selected === c.id ? s.leaderOn : ''}`}
              x1={x}
              y1={y}
              x2={LABEL_EDGE[c.side]}
              y2={y}
            />
          )
        })}
      </svg>

      {CALLOUTS.map((c) => {
        const level = levels[c.id]
        return (
          // Mouse/touch shortcut to the same zone; keyboard and screen readers use the labelled callout.
          <button
            key={`m-${c.id}`}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={`${s.marker} ${s[level]} ${isFlagged(level) ? s.flag : ''}`}
            aria-pressed={selected === c.id}
            style={{ left: pct(c.ax + BX, W), top: pct(c.ay + BY, H) }}
            onClick={() => onSelect(c.id)}
          >
            <ZoneIcon zone={c.id} className={s.markerIcon} />
          </button>
        )
      })}

      {CALLOUTS.map((c) => (
        <ZoneButton
          key={c.id}
          id={c.id}
          label={c.label}
          level={levels[c.id]}
          reading={headline[c.id]}
          selected={selected === c.id}
          onSelect={onSelect}
          className={`${s.callout} ${s[c.side]}`}
          style={{ top: pct(c.ay + BY, H) }}
        />
      ))}
    </div>
  )
}

interface ZoneButtonProps {
  id: ZoneId
  label: string
  level: Level
  reading?: Reading
  selected: boolean
  onSelect: (z: ZoneId) => void
  className?: string
  style?: CSSProperties
  icon?: boolean
}

/** One zone as a labelled button: body callouts, and tiles for zones with no body location. */
export function ZoneButton({ id, label, level, reading, selected, onSelect, className = '', style, icon }: ZoneButtonProps) {
  const flagged = isFlagged(level)
  return (
    <button
      type="button"
      className={`${s.zoneBtn} ${s[level]} ${flagged ? s.flag : ''} ${className}`}
      style={style}
      aria-pressed={selected}
      onClick={() => onSelect(id)}
    >
      {icon && (
        <span className={s.iconCircle}>
          <ZoneIcon zone={id} />
        </span>
      )}
      <span className={s.zoneText}>
        <span className={s.zoneName}>{label}</span>
        {reading && reading.value !== null && (
          <span className={s.zoneValue}>
            {reading.value.toFixed(reading.decimals)}
            <span className={s.unit}>{reading.unit}</span>
          </span>
        )}
        <span className={s.zoneWord}>
          <StatusIcon level={level} />
          {LEVEL_WORD[level]}
        </span>
      </span>
    </button>
  )
}
