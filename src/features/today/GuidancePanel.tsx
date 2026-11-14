import { GUIDANCE } from '../../data/guidance'
import s from './today.module.css'

const TENTATIVE = /design rule|source pending/i

/**
 * The four "learn more" sections for one metric, read from GUIDANCE[metricId].
 * Renders nothing if the metric has no guidance entry, so a missing entry never breaks the page.
 */
export function GuidancePanel({ metricId, open }: { metricId: string; open?: boolean }) {
  const g = GUIDANCE[metricId]
  if (!g) return null
  return (
    <div className={s.guide}>
      <details open={open}>
        <summary>What helps</summary>
        <ul>
          {g.helps.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>When to tell the flight surgeon</summary>
        <p>{g.tell}</p>
      </details>
      <details>
        <summary>How to measure</summary>
        <ol>
          {g.measure.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ol>
      </details>
      <details>
        <summary>Why space changes this</summary>
        <p>{g.why}</p>
      </details>
      <p className={s.sources}>
        <span className={s.sourcesLabel}>Sources</span>
        {g.sources.map((src) => (
          <span key={src} className={`${s.source} ${TENTATIVE.test(src) ? s.sourceTentative : ''}`}>
            {src}
          </span>
        ))}
      </p>
    </div>
  )
}
