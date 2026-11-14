import { GUIDANCE, actionFor } from '../../data/guidance'
import { LEVEL_WORD } from '../today/model.ts'
import t from '../today/today.module.css'
import s from './why.module.css'
import { whySentence, type WhyEvidence } from './evidence.ts'

const TENTATIVE = /design rule|source pending/i

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
  const frozen = e.frozen
  const step1 = actionFor(e.id, e.level)
  const sources = g?.sources ?? []
  const pending = !g || sources.some((x) => /source pending/i.test(x))

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
        <figure className={`${s.figure} ${frozen ? s.figureFrozen : ''}`}>
          <p className={frozen ? s.frozenTag : s.liveTag} data-testid="evidence-state">
            {frozen ? (
              <>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                {' '}Frozen evidence · as of day {frozen.raisedDay}
              </>
            ) : (
              'Live readings · no snapshot stored'
            )}
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${e.label}: ${frozen ? `evidence frozen on day ${frozen.raisedDay}, ` : ''}last ${e.points.length} readings${e.usual ? ', shaded band is your usual range' : ''}`}>
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
            {first !== undefined && last !== undefined ? `Day ${first} to day ${last}` : `Last ${e.points.length} readings${frozen ? ` up to day ${frozen.raisedDay}` : ''}`}
            {e.usual ? ' · shaded band = your usual range' : ''} · large dot = {frozen ? 'the reading that raised it' : 'latest'}
          </figcaption>
          {frozen && (
            <p className={s.muted}>
              This is what the app saw when it raised the alert. It does not change when you log new readings.
              {e.latest !== undefined && (
                <>
                  {' '}<strong>Since then:</strong> latest {e.latest.toFixed(e.decimals)} {e.unit}.
                </>
              )}
            </p>
          )}
          {!frozen && <p className={s.muted}>No snapshot from the day this was raised is stored, so this chart follows your latest readings.</p>}
        </figure>
      )}

      {g ? (
        <>
          <h3 className={s.sub}>What to do, in 3 steps</h3>
          <ol className={s.ladder} aria-label="What to do, in 3 steps">
            <li>
              <span className={s.rung} aria-hidden="true">1</span>
              <div>
                <p className={s.rungTitle}>Do now</p>
                {step1 && <p>{step1}</p>}
                {g.helps.length > 0 && (
                  <ul className={s.helps}>
                    {g.helps.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
            <li>
              <span className={s.rung} aria-hidden="true">2</span>
              <div>
                <p className={s.rungTitle}>Measure again</p>
                <ol className={s.helps}>
                  {g.measure.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ol>
              </div>
            </li>
            <li>
              <span className={s.rung} aria-hidden="true">3</span>
              <div>
                <p className={s.rungTitle}>Tell the flight surgeon</p>
                <p>When: {g.tell}</p>
              </div>
            </li>
          </ol>
          <h3 className={s.sub}>Why space changes this</h3>
          <p>{g.why}</p>
        </>
      ) : (
        <div className={s.pending} role="note">
          <p className={s.rungTitle}>Source pending</p>
          <p>No guidance has been written for {e.label} yet, so there are no steps to show. The evidence above is still accurate.</p>
        </div>
      )}

      {sources.length > 0 && (
        <ul className={s.sources} aria-label="Sources">
          {sources.map((src) => (
            <li key={src} className={TENTATIVE.test(src) ? s.sourceTentative : undefined}>
              {src}
              {TENTATIVE.test(src) ? ' (not a citation)' : ''}
            </li>
          ))}
        </ul>
      )}
      {pending && g && <p className={s.muted}>Source pending: part of this guidance has no citation yet.</p>}

      <form method="dialog" className={s.actions}>
        <button type="submit" className={t.ghostBtn} autoFocus>Close</button>
      </form>
    </dialog>
  )
}
