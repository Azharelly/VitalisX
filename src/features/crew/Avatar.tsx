import type { Level } from '../today/model.ts'
import { StatusIcon } from '../today/StatusIcon'
import c from './crew.module.css'
import t from '../today/today.module.css'

/** Initials in a status ring. The ring colour is backed by a shape badge, so it never relies on colour alone. */
export function Avatar({ initials, status, small }: { initials: string; status: Level; small?: boolean }) {
  return (
    <span className={`${c.ring} ${t[status]} ${small ? c.ringSmall : ''} ${status === 'learn' || status === 'none' ? c.dashed : ''}`} aria-hidden="true">
      <span className={c.face}>{initials}</span>
      <span className={c.ringBadge}>
        <StatusIcon level={status} />
      </span>
    </span>
  )
}
