import { LEVEL_WORD } from '../today/model.ts'
import t from '../today/today.module.css'
import { Avatar } from './Avatar'
import c from './crew.module.css'
import { useCrew } from './useCrew.ts'

/**
 * The crew avatars shown on every tab. Choosing one switches the person on every tab.
 * Every avatar shows its state as ring colour + shape + word; the selected one also shows name and role.
 * `onAdd` adds a "+" circle at the end (opens Add crew member).
 */
export function AvatarRow({ onAdd }: { onAdd?: () => void }) {
  const { board, selected, select } = useCrew()

  if (board.status === 'loading') return <div className={c.barSkeleton} aria-busy="true" aria-label="Loading crew" />
  if (board.status === 'error') return <p className={c.barNote}>Crew list unavailable</p>
  const members = board.board.members

  return (
    <ul className={c.avatars} aria-label="Crew member">
      {members.length === 0 && <li className={c.barNote}>No crew yet</li>}
      {members.map((m) => {
        const on = m.id === selected?.id
        return (
          <li key={m.id}>
            <button
              type="button"
              className={`${c.avatarBtn} ${on ? c.avatarOn : ''}`}
              aria-pressed={on}
              aria-label={`${m.name}${m.role ? `, ${m.role}` : ''}: ${LEVEL_WORD[m.status]}`}
              onClick={() => select(m.id)}
            >
              <Avatar initials={m.initials} status={m.status} small />
              {on ? (
                <span className={c.avatarText}>
                  <span className={c.avatarName}>
                    <span className={c.nameFull}>{m.name}</span>
                    <span className={c.nameShort}>{m.name.split(' ')[0]}</span>
                  </span>
                  <span className={c.avatarMeta}>
                    {m.role && <span className={c.avatarRole}>{m.role} · </span>}
                    <span className={`${c.avatarWord} ${t[m.status]}`}>{LEVEL_WORD[m.status]}</span>
                  </span>
                </span>
              ) : (
                <span className={`${c.avatarWord} ${t[m.status]}`}>{LEVEL_WORD[m.status]}</span>
              )}
            </button>
          </li>
        )
      })}
      {onAdd && (
        <li>
          <button type="button" className={c.addBtn} onClick={onAdd} aria-label="Add crew member" title="Add crew member">
            <span aria-hidden="true">+</span>
          </button>
        </li>
      )}
    </ul>
  )
}
