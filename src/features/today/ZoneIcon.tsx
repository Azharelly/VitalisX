import type { ReactNode } from 'react'
import type { ZoneId } from './model'

// Hand-drawn 24 × 24 line icons (no icon dependency). Radiation is filled; the rest are strokes.
const PATHS: Record<ZoneId, ReactNode> = {
  mind: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  eyes: (
    <>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  heart: (
    <>
      <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />
      <path d="M7.5 12h2.5l1.2-2.2 1.8 4.2 1.2-2h2.3" />
    </>
  ),
  bone: <path d="M6.5 7.5v9M17.5 7.5v9M3.5 10v4M20.5 10v4M6.5 12h11" />,
  immune: <path d="M12 3.2 19 6v5.6c0 4.4-2.9 7.6-7 9.2-4.1-1.6-7-4.8-7-9.2V6z" />,
  meta: <path d="M12 3.5c3.2 4.1 6 7.2 6 10.6a6 6 0 0 1-12 0c0-3.4 2.8-6.5 6-10.6z" />,
  radiation: (
    <g fill="currentColor" stroke="none">
      <circle cx="12" cy="12" r="1.6" />
      <path d="M10.5 9.4 8 5.07A8 8 0 0 1 16 5.07L13.5 9.4A3 3 0 0 0 10.5 9.4z" />
      <path d="M15 12h5a8 8 0 0 1-4 6.93l-2.5-4.33A3 3 0 0 0 15 12z" />
      <path d="M10.5 14.6 8 18.93A8 8 0 0 1 4 12h5a3 3 0 0 0 1.5 2.6z" />
    </g>
  ),
}

export function ZoneIcon({ zone, className }: { zone: ZoneId; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[zone]}
    </svg>
  )
}
