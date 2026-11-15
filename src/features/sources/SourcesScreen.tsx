import { useEffect, useState } from 'react'
import { db } from '../../data/db'
import type { Metric, ReferenceSource } from '../../data/types'
import { BASELINE_DAYS, MIN_BASELINE_POINTS } from '../../engine/baseline'
import { ALERT_Z, WATCH_MAX_GAP_DAYS, WATCH_RUN, WATCH_Z } from '../../engine/evaluate'
import { WATCH_PROJECTION_FRACTION } from '../../engine/radiation'
import t from '../today/today.module.css'
import s from './sources.module.css'
import { AI_USE_DECLARATION, LIBRARIES } from './content'

const isLink = (x: string) => /^https?:\/\//.test(x.trim())
/** "Vol. 1 Rev C, page 41: https://…" → the text before the link, and the link. */
const splitLink = (x: string) => {
  const m = x.match(/https?:\/\/\S+/)
  return m ? { text: x.slice(0, m.index).replace(/[:\s]+$/, ''), href: m[0] } : { text: x, href: undefined }
}

/**
 * F-11 / issue #31: where every number and fact comes from, which rules are our own, the software we use,
 * and how AI was used. References and metric rules are read from the app's own tables, the limits from the
 * engine's constants, so this page cannot drift from what the app actually does.
 */
export function SourcesScreen() {
  const [refs, setRefs] = useState<ReferenceSource[]>()
  const [metrics, setMetrics] = useState<Metric[]>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let live = true
    Promise.all([db.reference_source.toArray(), db.metric.toArray()]).then(
      ([r, m]) => {
        if (!live) return
        setRefs(r.filter((x) => x.id !== 'design_rule'))
        setMetrics(m.filter((x) => x.abs_rule))
      },
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [])

  return (
    <section className={`${t.root} ${s.page}`} aria-labelledby="sources-title">
      <span className={t.eyebrow}>About this prototype</span>
      <h1 id="sources-title" className={s.title}>
        Sources &amp; AI use
      </h1>
      <p className={s.lead}>
        VitalisX is a hackathon prototype for decision support, not a medical device. The crew and their readings are simulated. It does not call
        anyone: in a real emergency the crew follows the mission's own procedures.
      </p>

      <section className={s.card} aria-labelledby="src-data">
        <h2 id="src-data" className={s.h2}>
          Space-weather data
        </h2>
        <ul className={s.list}>
          <li>
            <strong>NASA DONKI</strong>, via the NASA Community Coordinated Modeling Center (CCMC): solar flares, coronal mass ejections,
            geomagnetic storms and solar particle events. Read live when online; a saved copy keeps the app working offline, and the
            Radiation tab says which one you are seeing.{' '}
            <a href="https://ccmc.gsfc.nasa.gov/tools/DONKI/" target="_blank" rel="noreferrer">
              ccmc.gsfc.nasa.gov
            </a>
          </li>
          <li>
            <strong>NOAA Space Weather Scales</strong>: geomagnetic storms are named G1 to G5 from the Kp index (Kp 5 = G1 … Kp 9 = G5).{' '}
            <a href="https://www.swpc.noaa.gov/noaa-scales-explanation" target="_blank" rel="noreferrer">
              swpc.noaa.gov
            </a>
          </li>
        </ul>
      </section>

      <section className={s.card} aria-labelledby="src-refs">
        <h2 id="src-refs" className={s.h2}>
          References
        </h2>
        <p className={t.muted}>What each one is used for in the app. An entry still marked "to be confirmed" is being checked.</p>
        {error && (
          <p className={s.error} role="alert">
            Could not read the references: {error}
          </p>
        )}
        {!refs && !error && <p className={t.muted}>Loading…</p>}
        {refs && (
          <ol className={s.refs}>
            {refs.map((r) => {
              const { text, href } = splitLink(r.link_or_doi)
              return (
                <li key={r.id}>
                  <strong>{r.title}</strong>
                  <span className={t.muted}>{r.finding}</span>
                  <span className={s.meta}>
                    Used for: {r.used_for}
                    {' · '}
                    {href ? (
                      <>
                        {text && `${text} · `}
                        <a href={href} target="_blank" rel="noreferrer">
                          {isLink(r.link_or_doi) ? 'link' : 'source link'}
                        </a>
                      </>
                    ) : (
                      text
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className={s.card} aria-labelledby="src-rules">
        <h2 id="src-rules" className={s.h2}>
          Our own design rules
        </h2>
        <p className={t.muted}>These limits are the team's choices, not NASA's or anyone else's. The app labels them the same way wherever they show.</p>
        <ul className={s.list}>
          <li>
            <strong>Your normal</strong> is learned from the last {BASELINE_DAYS} days and needs {MIN_BASELINE_POINTS} readings first ("Learning"
            until then). <strong>Watch</strong>: {WATCH_RUN} readings in a row, no more than {WATCH_MAX_GAP_DAYS} days apart, each at least {WATCH_Z}{' '}
            times your usual variation away. <strong>Alert</strong>: one reading {ALERT_Z} times your usual variation away.
          </li>
          {metrics?.map((m) => (
            <li key={m.id}>
              <strong>{m.label}</strong>: {m.abs_rule}
            </li>
          ))}
          <li>
            <strong>Radiation Watch</strong> from {Math.round(WATCH_PROJECTION_FRACTION * 100)}% of the 600 mSv career limit projected at arrival.
          </li>
          <li>
            <strong>Solar particle event warning</strong>: Watch for any event in the last 24 h; Alert when a satellite also measured particles above
            100 MeV.
          </li>
          <li>
            <strong>Emergency guides</strong> are example content, not clinically validated. The mission's Medical Checklist always wins, and the app
            gives no doses.
          </li>
        </ul>
      </section>

      <section className={s.card} aria-labelledby="src-libs">
        <h2 id="src-libs" className={s.h2}>
          Software and licenses
        </h2>
        <ul className={s.libs}>
          {LIBRARIES.map((l) => (
            <li key={l.name}>
              <span>
                <strong>{l.name}</strong> <span className={t.muted}>{l.use}</span>
              </span>
              <span className={s.license}>{l.license}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Hidden in the published app until the team has written it; visible while developing so it is not forgotten. */}
      {(AI_USE_DECLARATION || import.meta.env.DEV) && (
        <section className={s.card} aria-labelledby="src-ai">
          <h2 id="src-ai" className={s.h2}>
            AI-use declaration
          </h2>
          {AI_USE_DECLARATION ? (
            AI_USE_DECLARATION.split('\n\n').map((p, i) => <p key={i}>{p}</p>)
          ) : (
            <p className={s.todo}>Not written yet (issue #31). Add it in src/features/sources/content.ts. Only shown while developing.</p>
          )}
        </section>
      )}
    </section>
  )
}
