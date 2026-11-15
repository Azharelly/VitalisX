import { useEffect, useState } from 'react'
import { loadEndedEmergencySessions } from '../../data/emergencySessions'
import { DEFAULT_COMMS_DELAY_SEC, flushOutbox, type OutboxMessage, type OutboxPort, type SendToEarth } from '../../data/outbox'
import type { EmergencySession } from '../emergency/model'
import { CONDITION_LABELS } from '../emergency/protocols'
import { emergencyLogText } from '../emergency/session'
import t from '../today/today.module.css'
import s from './messages.module.css'

interface Props {
  names: Record<string, string>
  /** Already in the outbox: a log whose exact text is here was sent before. */
  messages: OutboxMessage[]
  outbox?: OutboxPort
  send?: SendToEarth
  commsDelaySec?: number
  day: number
  /** Re-read the outbox after sending. */
  onSent: () => void
  /** Only this person's emergencies (the Report page); omitted = the whole crew (Messages page). */
  patientId?: string
  /** Replaces the section's own spacing, to sit inside another page's panel. */
  className?: string
}

const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dateOf = (iso: string) => `${new Date(iso).getDate()} ${MONTHS[new Date(iso).getMonth()]}`

/** Finished emergencies saved on this device: read the log, send it to the flight surgeon, or copy it. */
export function EmergencyLogs({ names, messages, outbox, send, commsDelaySec = DEFAULT_COMMS_DELAY_SEC, day, onSent, patientId, className }: Props) {
  const [sessions, setSessions] = useState<EmergencySession[]>()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<Record<string, { text: string; error?: boolean }>>({})
  const [busy, setBusy] = useState<string>()

  useEffect(() => {
    let live = true
    loadEndedEmergencySessions().then(
      (list) => live && setSessions(patientId ? list.filter((x) => x.patientId === patientId) : list),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [patientId])

  const say = (id: string, text: string, isError = false) => setStatus((x) => ({ ...x, [id]: { text, error: isError } }))

  const sendLog = async (session: EmergencySession, text: string) => {
    if (!outbox) return
    setBusy(session.id)
    try {
      await outbox.queue({ crewId: session.patientId, day, text, delaySec: commsDelaySec })
      const r = send ? await flushOutbox(outbox, session.patientId, send) : undefined
      if (r?.error) say(session.id, `Saved, but not sent: ${r.error.message}. It waits on the Messages list.`, true)
      else say(session.id, send ? `Sent. Earth receives it in about ${Math.round(commsDelaySec / 60)} min${patientId ? '; follow it on the Messages page' : ''}.` : 'Saved. It will be sent when the Earth link is available.')
      onSent()
    } catch (e) {
      say(session.id, `Could not send: ${e instanceof Error ? e.message : String(e)}. Use Copy instead.`, true)
    } finally {
      setBusy(undefined)
    }
  }

  const copy = (id: string, text: string) =>
    navigator.clipboard.writeText(text).then(
      () => say(id, 'Copied. Paste it wherever you need it.'),
      () => say(id, 'Could not copy on this device. Open the log and select the text.', true),
    )

  return (
    <section className={className ?? s.logs} aria-labelledby={`logs-title-${patientId ?? 'all'}`}>
      <h2 id={`logs-title-${patientId ?? 'all'}`} className={s.subtitle}>
        {patientId ? 'Emergencies' : 'Emergency logs'}
      </h2>
      <p className={t.muted}>
        {patientId ? `Every finished emergency for ${(names[patientId] ?? 'this person').split(' ')[0]}` : 'Finished emergencies'}, saved on this
        device. Reset demo deletes them.
      </p>

      {error && (
        <p className={s.error} role="alert">
          Could not read the emergency logs: {error}
        </p>
      )}
      {!sessions && !error && <p className={t.muted}>Loading…</p>}
      {sessions?.length === 0 && (
        <div className={s.empty}>
          <p className={s.emptyTitle}>{patientId ? 'No emergencies so far' : 'No finished emergencies'}</p>
          <p className={t.muted}>When an emergency ends, its log is kept here.</p>
        </div>
      )}
      {sessions && sessions.length > 0 && (
        <ol className={s.list}>
          {sessions.map((x) => {
            const name = names[x.patientId]
            const text = emergencyLogText(x, name ? { name } : undefined)
            const sentBefore = messages.find((m) => m.text === text)
            const minutes = Math.max(1, Math.round((Date.parse(x.endedAtIso!) - Date.parse(x.startedAtIso)) / 60000))
            return (
              <li key={x.id} className={s.item}>
                <div className={s.itemHead}>
                  <span className={`${s.kind} ${s.kindLog}`}>Emergency log</span>
                  <span className={s.who}>
                    {CONDITION_LABELS[x.condition]} · {name ?? 'Unknown crew member'}
                  </span>
                </div>
                <p className={t.muted}>
                  {dateOf(x.startedAtIso)} · {hhmm(x.startedAtIso)}–{hhmm(x.endedAtIso!)} ({minutes} min) · {x.completedStepIds.length} steps done ·{' '}
                  {(x.vitals ?? []).length} vitals recorded
                </p>
                <details className={s.details}>
                  <summary>Show the log ({x.logEntries.length} entries)</summary>
                  <pre className={s.pre}>{text}</pre>
                </details>
                <div className={s.actions}>
                  {outbox && name && (
                    <button type="button" className={sentBefore ? t.ghostBtn : t.primaryBtn} disabled={busy === x.id} onClick={() => sendLog(x, text)}>
                      {busy === x.id ? 'Sending…' : sentBefore ? 'Send again' : 'Send log to flight surgeon'}
                    </button>
                  )}
                  <button type="button" className={t.ghostBtn} onClick={() => copy(x.id, text)}>
                    Copy as text
                  </button>
                </div>
                {sentBefore && !status[x.id] && <p className={t.muted}>Sent {hhmm(sentBefore.createdAt)}. {patientId ? 'Follow it on the Messages page.' : 'It is on the list above.'}</p>}
                {!name && <p className={t.muted}>This person is no longer in the crew, so the log cannot be sent from here. Copy it instead.</p>}
                {status[x.id] && (
                  <p className={status[x.id]!.error ? s.error : s.status} role={status[x.id]!.error ? 'alert' : 'status'}>
                    {status[x.id]!.text}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
