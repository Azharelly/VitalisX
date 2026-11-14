import { useEffect, useState } from 'react'
import { arrivalLeftSec, DEFAULT_COMMS_DELAY_SEC, flushOutbox, type OutboxMessage, type OutboxPort, type SendToEarth } from '../../data/outbox'
import type { ReportView } from '../today/model.ts'
import t from '../today/today.module.css'
import { SBAR_FIELDS, draftSbar, isSendable, sbarToText, type Sbar } from './sbar.ts'
import s from './sbar.module.css'

interface Props {
  report: ReportView
  outbox: OutboxPort
  /** Delivery to Earth. Omitted = messages are saved and stay queued. */
  send?: SendToEarth
  /** One-way communication delay in seconds. */
  commsDelaySec?: number
  onClose: () => void
}

/** Fewer check-in days than this and the summary is "not ready yet" (#23). */
export const MIN_CHECKIN_DAYS = 3

const draftKey = (r: ReportView) => `vitalis.sbarDraft.${r.person.id}.${r.days}.${r.missionDay}`
function loadDraft(r: ReportView): Sbar {
  try {
    const raw = localStorage.getItem(draftKey(r))
    if (raw) return { ...draftSbar(r), ...(JSON.parse(raw) as Partial<Sbar>) }
  } catch {
    /* no storage: fall back to a fresh draft */
  }
  return draftSbar(r)
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

const minutes = (sec: number) => (sec < 90 ? `${Math.round(sec)} s` : `${Math.round(sec / 60)} min`)

/** F-07: SBAR editor + outbox for one person. Native modal <dialog>: Escape closes, focus stays inside. */
export function SbarDialog({ report, outbox, send, commsDelaySec = DEFAULT_COMMS_DELAY_SEC, onClose }: Props) {
  const crewId = report.person.id
  const [draft, setDraft] = useState<Sbar>(() => loadDraft(report))
  const [messages, setMessages] = useState<OutboxMessage[]>([])
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; error?: boolean }>()
  const [lastQueued, setLastQueued] = useState<string>()

  useEffect(() => {
    let live = true
    outbox.list(crewId).then(
      (m) => live && setMessages(m),
      (e: unknown) => live && setStatus({ text: `Could not read the outbox: ${e instanceof Error ? e.message : String(e)}`, error: true }),
    )
    return () => {
      live = false
    }
  }, [outbox, crewId, tick])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(report), JSON.stringify(draft))
    } catch {
      /* storage full or blocked: draft lives only in memory */
    }
  }, [draft, report])
  const ready = report.logged >= MIN_CHECKIN_DAYS

  const text = sbarToText(draft)
  const queuedCount = messages.filter((m) => m.status === 'queued').length
  const set = (key: keyof Sbar, value: string) => setDraft((d) => ({ ...d, [key]: value }))

  async function run(work: () => Promise<string>) {
    setBusy(true)
    setStatus(undefined)
    try {
      setStatus({ text: await work() })
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), error: true })
    } finally {
      setBusy(false)
      setTick((n) => n + 1)
    }
  }

  const deliver = async () => {
    if (!send) return 'Saved on this device. It will be sent when the Earth link is available.'
    const r = await flushOutbox(outbox, crewId, send)
    if (r.error) throw new Error(`Saved, but not sent: ${r.error.message}. ${r.remaining} still queued.`)
    return `Sent. Earth receives it in about ${minutes(commsDelaySec)}.`
  }

  const queue = () =>
    run(async () => {
      await outbox.queue({ crewId, day: report.missionDay, text, delaySec: commsDelaySec })
      setLastQueued(text)
      try {
        localStorage.removeItem(draftKey(report))
      } catch {
        /* ignore */
      }
      return deliver()
    })
  const retry = () => run(deliver)
  const discard = (id: number) => run(async () => ((await outbox.discard(id)) ? 'Removed from the outbox.' : 'That message was already sent.'))

  return (
    <dialog
      ref={(d) => {
        if (d && !d.open) d.showModal()
      }}
      className={`${t.theme} ${s.dialog}`}
      aria-labelledby="sbar-title"
      onClose={onClose}
    >
      <p className={s.eyebrow}>Message to Earth · {report.person.name}</p>
      <h2 id="sbar-title" className={s.title}>
        Summary for the flight surgeon
      </h2>
      <p className={s.muted}>
        Drafted from your {report.days === 7 ? 'week' : 'month'} in review. Check every line and change what you like. Earth is about {minutes(commsDelaySec)} away, one way, so
        expect the reply later.
      </p>

      {!ready && (
        <p className={s.status} role="note" data-testid="sbar-not-ready">
          <strong>Not ready yet.</strong> The summary needs at least {MIN_CHECKIN_DAYS} check-in days in this period; you have {report.logged}. Your edits are kept.
        </p>
      )}

      <div className={s.fields}>
        {SBAR_FIELDS.map((f) => (
          <label key={f.key} className={s.field}>
            <span className={s.fieldHead}>
              <span className={s.letter} aria-hidden="true">
                {f.letter}
              </span>
              <span className={s.fieldTitle}>{f.title}</span>
              <span className={s.muted}>{f.hint}</span>
            </span>
            <textarea value={draft[f.key]} rows={f.key === 'assessment' ? 5 : 3} onChange={(e) => set(f.key, e.target.value)} />
          </label>
        ))}
      </div>

      <div className={s.actions}>
        <button type="button" className={s.primary} disabled={busy || !ready || !isSendable(draft) || text === lastQueued} onClick={queue}>
          {busy ? 'Working…' : send ? 'Send to Earth' : 'Queue for Earth'}
        </button>
        <button type="button" className={s.ghost} onClick={onClose}>
          Close
        </button>
      </div>
      <p role={status?.error ? 'alert' : 'status'} className={`${s.status} ${status?.error ? s.error : ''}`}>
        {status?.text}
      </p>

      <section aria-labelledby="outbox-title" className={s.outbox}>
        <h3 id="outbox-title" className={s.sub}>
          Outbox{queuedCount > 0 && <span className={s.count}>{queuedCount} waiting</span>}
        </h3>
        {messages.length === 0 ? (
          <p className={s.muted}>Nothing yet. Messages stay here after you close the app.</p>
        ) : (
          <ul className={s.list}>
            {messages.map((m) => (
              <li key={m.id} className={s.item}>
                <div className={s.itemHead}>
                  <span className={`${s.pill} ${m.status === 'queued' ? s.waiting : s.done}`}>{m.status === 'queued' ? 'Waiting to send' : 'Sent'}</span>
                  <span className={s.muted}>
                    Day {m.day} · {new Date(m.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
                  </span>
                  {(
                    <span className={s.muted} data-testid="arrival">
                      {arrivalLeftSec(m, now, commsDelaySec) > 0 ? `Reaches Earth in ${clock(arrivalLeftSec(m, now, commsDelaySec))}` : 'Reached Earth'}
                    </span>
                  )}
                </div>
                <details>
                  <summary>{m.text.split('\n').find((l) => l.trim() && !/^[SBAR] — /.test(l)) ?? 'Message'}</summary>
                  <pre className={s.pre}>{m.text}</pre>
                </details>
                {m.status === 'queued' && (
                  <div className={s.itemActions}>
                    {send && (
                      <button type="button" className={s.ghost} disabled={busy} onClick={retry}>
                        Send now
                      </button>
                    )}
                    <button type="button" className={s.ghost} disabled={busy} onClick={() => discard(m.id)}>
                      Discard
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </dialog>
  )
}
