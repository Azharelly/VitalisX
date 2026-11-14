import { GUIDANCE } from '../../data/guidance'
import { LEVEL_WORD } from '../today/model.ts'
import t from '../today/today.module.css'
import s from './why.module.css'
import { whySentence, type WhyEvidence } from './evidence.ts'

const W = 420
const H = 160
const PAD = 24

/** F-05: the evidence behind a Watch / Alert. Native modal <dialog>: Escape closes, focus stays inside. */
export function WhyModal({ e, onClose }: { e: WhyEvidence; onClose: () => void }) {
  const g = GUIDANCE[e.id]
  const vals = e.points.map((p) => p.value)
  const lo = Math.min(...vals, e.usual?.[0] ?? Infinity)
  const hi = Math.max(...vals, e.usual?.[1] ?? -Infinity)
  const span = hi - lo || 1
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD)
  const x = (i: number) => (e.points.length < 2 ? W / 2 : PAD + (i / (e.points.length - 1)) * (W - 2 * PAD))
  const line = e.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const first = e.points[0]?.day
  const last = e.points.at(-1)?.day

  return (
    <dialog
      ref={(d) => {
        if (d && !d.open) d.showModal()
      }}
      className={`${t.theme} ${s.dialog}`}
      aria-labelledby="why-title"
      onClose={onClose}
    >
      <p className={`${s.level} ${t[e.level]}`}>{LEVEL_WORD[e.level]}</p>
      <h2 id="why-title" className={s.title}>Why is {e.label} flagged?</h2>
      <p className={s.reason}>{whySentence(e)}</p>
      {e.note && <p className={s.muted}>{e.note}</p>}

      {e.points.length > 0 && (
        <figure className={s.figure}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${e.label}: last ${e.points.length} readings${e.usual ? ', shaded band is your usual range' : ''}`}>
            {e.usual && (
              <rect className={s.band} x={PAD} width={W - 2 * PAD} y={y(e.usual[1])} height={Math.max(1, y(e.usual[0]) - y(e.usual[1]))} />
            )}
            <path className={s.line} d={line} />
            {e.points.map((p, i) => (
              <circle key={i} className={`${s.dot} ${p.level ? t[p.level] : ''} ${i === e.points.length - 1 ? s.dotLast : ''}`} cx={x(i)} cy={y(p.value)} r={i === e.points.length - 1 ? 5 : 3}>
                <title>{`${p.day !== undefined ? `Day ${p.day}: ` : ''}${p.value.toFixed(e.decimals)} ${e.unit}`}</title>
              </circle>
            ))}
          </svg>
          <figcaption className={s.muted}>
            {first !== undefined && last !== undefined ? `Day ${first} to day ${last}` : `Last ${e.points.length} readings`}
            {e.usual ? ' · shaded band = your usual range' : ''} · large dot = latest
          </figcaption>
        </figure>
      )}

      {g && (
        <>
          <h3 className={s.sub}>Tell the flight surgeon when</h3>
          <p>{g.tell}</p>
          <h3 className={s.sub}>Why space changes this</h3>
          <p>{g.why}</p>
          <p className={s.muted}>Sources: {g.sources.join(' · ')}</p>
        </>
      )}

      <form method="dialog" className={s.actions}>
        <button type="submit" className={t.ghostBtn} autoFocus>Close</button>
      </form>
    </dialog>
  )
}
