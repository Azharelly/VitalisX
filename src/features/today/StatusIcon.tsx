import type { Level } from './model'
import s from './today.module.css'

// Shape carries the state as well as colour: circle normal, square watch, diamond alert, dashed learning.
export function StatusIcon({ level }: { level: Level }) {
  return (
    <svg className={`${s.icon} ${s[level]}`} viewBox="0 0 14 14" aria-hidden="true">
      {level === 'alert' && <rect x="3" y="3" width="8" height="8" transform="rotate(45 7 7)" />}
      {level === 'watch' && <rect x="2.5" y="2.5" width="9" height="9" rx="1" />}
      {level === 'ok' && <circle cx="7" cy="7" r="4.5" />}
      {level === 'learn' && <circle cx="7" cy="7" r="4.5" fill="none" strokeWidth="1.5" strokeDasharray="2.4 1.6" />}
      {level === 'none' && <circle cx="7" cy="7" r="4.5" fill="none" strokeWidth="1.5" />}
    </svg>
  )
}
