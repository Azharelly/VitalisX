import { LEVEL_WORD } from '../today/model.ts'
import t from '../today/today.module.css'
import { Avatar } from './Avatar'
import c from './crew.module.css'
import { useCrew } from './useCrew.ts'

/**
 * The row of crew avatars at the top of every tab. Choosing one switches the person on every tab.
 * Each avatar shows its state as ring colour + shape + word.
 */
export function AvatarRow() {
  const { board, selected, select } = useCrew()

  return (
    <nav className={`${t.theme} ${c.bar}`} aria-label="Crew member">
      {board.status === 'loading' && <div className={c.barSkeleton} aria-busy="true" aria-label="Loading crew" />}
      {board.status === 'error' && <p className={t.muted}>Crew list unavailable.</p>}
      {board.status === 'ready' && board.board.members.length === 0 && <p className={t.muted}>No crew members yet. Add one on the Crew tab.</p>}
      {board.status === 'ready' && (
        <ul className={c.avatars}>
          {board.board.members.map((m) => (
            <li key={m.id}>
              <button type="button" className={c.avatarBtn} aria-pressed={m.id === selected?.id} aria-label={`${m.name}, ${m.role || 'crew'}: ${LEVEL_WORD[m.status]}`} onClick={() => select(m.id)}>
                <Avatar initials={m.initials} status={m.status} />
                <span className={c.avatarText}>
                  <span className={c.avatarName}>{m.name.split(' ')[0]}</span>
                  <span className={`${c.avatarWord} ${t[m.status]}`}>{LEVEL_WORD[m.status]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
