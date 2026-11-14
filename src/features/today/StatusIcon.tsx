import type { Level } from './model'
import ui from './shared.module.css'

/** Status shape, so colour is never the only signal: ● normal, ▲ watch, ◆ alert, dashed ○ learning. */
export function StatusIcon({ level }: { level: Level }) {
  return (
    <svg className={`${ui.icon} ${ui[level]}`} viewBox="0 0 14 14" aria-hidden="true">
      {level === 'alert' && <rect x="3" y="3" width="8" height="8" transform="rotate(45 7 7)" />}
      {level === 'watch' && <polygon points="7,1.5 12.8,12 1.2,12" />}
      {level === 'ok' && <circle cx="7" cy="7" r="4.5" />}
      {level === 'learn' && <circle cx="7" cy="7" r="4.5" fill="none" strokeWidth="1.5" strokeDasharray="2.4 1.6" />}
      {level === 'none' && <circle cx="7" cy="7" r="4.5" fill="none" strokeWidth="1.5" />}
    </svg>
  )
}

/** Status badge: shape + word, tinted by level. */
export function StatusBadge({ level, label }: { level: Level; label: string }) {
  return (
    <span className={`${ui.badge} ${ui[level]}`}>
      <StatusIcon level={level} />
      {label}
    </span>
  )
}
