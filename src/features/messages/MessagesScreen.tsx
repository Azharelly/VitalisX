import { useEffect, useState } from 'react'
import { DEFAULT_COMMS_DELAY_SEC, flushOutbox, type OutboxMessage, type OutboxPort, type SendToEarth } from '../../data/outbox'
import t from '../today/today.module.css'
import { EmergencyLogs } from './EmergencyLogs'
import { headlineOf, isEmergency, isLog, replyFor, tripOf, type Stage } from './model'
import s from './messages.module.css'

interface Props {
  messages: OutboxMessage[]
  error?: string
  /** crew id → name */
  names: Record<string, string>
  outbox?: OutboxPort
  send?: SendToEarth
  commsDelaySec?: number
  /** Mission day, stamped on logs sent from here. */
  day: number
  /** Re-read the outbox after Send now / Discard. */
  onChanged: () => void
}

const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
/** "in 12 min", then "in 40 s" for the last minute: a m:ss countdown read like a clock time next to "11:22". */
const inTime = (ms: number) => {
  const sec = Math.max(0, Math.ceil(ms / 1000))
  return sec > 60 ? `in ${Math.ceil(sec / 60)} min` : `in ${sec} s`
}
const minutes = (sec: number) => (sec < 90 ? `${Math.round(sec)} s` : `${Math.round(sec / 60)} min`)

const STEPS: { stage: Stage; label: string }[] = [
  { stage: 'waiting', label: 'Sent' },
  { stage: 'travelling', label: 'On its way' },
  { stage: 'arrived', label: 'Arrived' },
  { stage: 'replied', label: 'Reply' },
]
const ORDER: Stage[] = ['waiting', 'travelling', 'arrived', 'replied']

/** Everything the crew has sent to the flight surgeon, and where each message is on its trip. */
export function MessagesScreen({ messages, error, names, outbox, send, commsDelaySec = DEFAULT_COMMS_DELAY_SEC, day, onChanged }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [who, setWho] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; error?: boolean }>()

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const people = [...new Set(messages.map((m) => m.crewId))]
  const shown = who ? messages.filter((m) => m.crewId === who) : messages

  async function run(work: () => Promise<string>) {
    setBusy(true)
    setStatus(undefined)
    try {
      setStatus({ text: await work() })
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true })
    } finally {
      setBusy(false)
      onChanged()
    }
  }
  const sendNow = (crewId: string) =>
    run(async () => {
      if (!outbox || !send) return 'No Earth link in this view. The message stays saved here.'
      const r = await flushOutbox(outbox, crewId, send)
      if (r.error) throw new Error(`Not sent: ${r.error.message}. ${r.remaining} still waiting.`)
      return `Sent. Earth receives it in about ${minutes(commsDelaySec)}.`
    })
  const discard = (id: number) =>
    run(async () => ((await outbox?.discard(id)) ? 'Removed. It was never sent.' : 'That message was already sent.'))

  return (
    <section className={`${t.root} ${s.page}`} aria-labelledby="messages-title">
      <span className={t.eyebrow}>Earth link · simulated</span>
      <h1 id="messages-title" className={s.title}>
        Messages to Earth
      </h1>
      <p className={s.lead}>
        Earth is {minutes(commsDelaySec)} away, one way, so a reply takes at least {minutes(commsDelaySec * 2)}. This demo has no real link:
        delivery and replies are simulated.
      </p>

      {people.length > 1 && (
        <div className={s.filter} role="group" aria-label="Show messages for">
          <button type="button" className={s.chip} aria-pressed={!who} onClick={() => setWho(undefined)}>
            Everyone
          </button>
          {people.map((id) => (
            <button key={id} type="button" className={s.chip} aria-pressed={who === id} onClick={() => setWho(id)}>
              {(names[id] ?? 'Crew').split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className={s.error} role="alert">
          Could not read the messages: {error}
        </p>
      )}
      {status && (
        <p className={status.error ? s.error : s.status} role={status.error ? 'alert' : 'status'}>
          {status.text}
        </p>
      )}

      {!outbox ? (
        <p className={t.muted}>This view has no outbox.</p>
      ) : shown.length === 0 ? (
        <div className={s.empty}>
          <p className={s.emptyTitle}>No messages yet</p>
          <p className={t.muted}>Send a summary from the Report tab, or a message to the flight surgeon during an emergency. They all show up here.</p>
        </div>
      ) : (
        <ol className={s.list}>
          {shown.map((m) => (
            <Item key={m.id} m={m} now={now} name={names[m.crewId] ?? 'Crew member'} commsDelaySec={commsDelaySec} busy={busy} canSend={!!send} onSend={() => sendNow(m.crewId)} onDiscard={() => discard(m.id)} />
          ))}
        </ol>
      )}

      <EmergencyLogs names={names} messages={messages} outbox={outbox} send={send} commsDelaySec={commsDelaySec} day={day} onSent={onChanged} />
    </section>
  )
}

function Item({ m, now, name, commsDelaySec, busy, canSend, onSend, onDiscard }: {
  m: OutboxMessage; now: number; name: string; commsDelaySec: number; busy: boolean; canSend: boolean; onSend: () => void; onDiscard: () => void
}) {
  const trip = tripOf(m, now, commsDelaySec)
  const emergency = isEmergency(m)
  const log = isLog(m)
  const at = ORDER.indexOf(trip.stage)
  const where =
    trip.stage === 'waiting'
      ? 'Waiting to send: the Earth link was not available.'
      : trip.stage === 'travelling'
        ? `On its way. Arrives at ${hhmm(trip.arrivesAt)}, ${inTime(trip.arrivesAt - now)}.`
        : trip.stage === 'arrived'
          ? `Arrived at ${hhmm(trip.arrivesAt)}. Earliest reply at ${hhmm(trip.replyAt)}, ${inTime(trip.replyAt - now)}.`
          : `Reply received ${hhmm(trip.replyAt)}.`

  return (
    <li className={`${s.item} ${emergency ? `${s.urgent} ${t.alert}` : ''}`}>
      <div className={s.itemHead}>
        <span className={`${s.kind} ${emergency ? s.kindEmergency : log ? s.kindLog : ''}`}>{emergency ? 'Emergency' : log ? 'Emergency log' : 'Summary'}</span>
        <span className={s.who}>{name}</span>
        <span className={t.muted}>
          Day {m.day} · {hhmm(Date.parse(m.createdAt))}
        </span>
      </div>

      <ol className={s.track} aria-label="Delivery">
        {STEPS.map((x, i) => (
          <li key={x.stage} className={i < at || (i === at && trip.stage === 'replied') ? s.done : i === at ? s.now : ''} aria-current={i === at ? 'step' : undefined}>
            {i === 0 && trip.stage === 'waiting' ? 'Waiting' : x.label}
          </li>
        ))}
      </ol>
      <p className={s.where} aria-live="off">
        {where}
      </p>

      <details className={s.details}>
        <summary>{headlineOf(m.text)}</summary>
        <pre className={s.pre}>{m.text}</pre>
      </details>

      {trip.stage === 'replied' && (
        <div className={s.reply}>
          <span className={t.eyebrow}>Flight surgeon · simulated reply</span>
          <p>{replyFor(m)}</p>
        </div>
      )}

      {trip.stage === 'waiting' && (
        <div className={s.actions}>
          {canSend && (
            <button type="button" className={t.primaryBtn} disabled={busy} onClick={onSend}>
              Send now
            </button>
          )}
          <button type="button" className={t.ghostBtn} disabled={busy} onClick={onDiscard}>
            Discard
          </button>
        </div>
      )}
    </li>
  )
}
