// Messages to Earth: where each message is on its trip, worked out from stored fields only (dossier R-09), so a reload
// or a closed app never loses the state. There is no real Earth link yet: arrival and replies are simulated.
import { DEFAULT_COMMS_DELAY_SEC, type OutboxMessage } from '../../data/outbox'

/**
 * Emergency messages share the outbox with Report summaries and are told apart by their first line.
 * shortcut: a text prefix instead of a kind field in action_log; move to kind 'emergency' when the outbox port takes a kind.
 */
export const EMERGENCY_PREFIX = 'EMERGENCY · '

/** A finished emergency's full log, sent later from "Emergency logs". */
export const LOG_PREFIX = 'EMERGENCY LOG · '

export const isEmergency = (m: Pick<OutboxMessage, 'text'>) => m.text.startsWith(EMERGENCY_PREFIX)
export const isLog = (m: Pick<OutboxMessage, 'text'>) => m.text.startsWith(LOG_PREFIX)

export type Stage = 'waiting' | 'travelling' | 'arrived' | 'replied'

export interface Trip {
  stage: Stage
  arrivesAt: number // ms
  replyAt: number // ms: one delay there, one back
}

/** Waiting = not sent yet (link down). Then on its way for one delay, arrived, and a reply after twice the delay. */
export function tripOf(m: Pick<OutboxMessage, 'createdAt' | 'delaySec' | 'status'>, now: number, fallbackDelaySec = DEFAULT_COMMS_DELAY_SEC): Trip {
  const delayMs = (m.delaySec ?? fallbackDelaySec) * 1000
  const sentAt = Date.parse(m.createdAt)
  const arrivesAt = sentAt + delayMs
  const replyAt = sentAt + 2 * delayMs
  const stage: Stage = m.status === 'queued' ? 'waiting' : now < arrivesAt ? 'travelling' : now < replyAt ? 'arrived' : 'replied'
  return { stage, arrivesAt, replyAt }
}

/** The demo's flight-surgeon replies. Generic on purpose: no doses, no diagnosis, always labelled simulated. */
export const SIMULATED_REPLY = {
  summary:
    'Summary received, thank you. Keep the current plan and keep checking in daily. If a flagged reading is still outside your usual in two days, send an update.',
  emergency:
    'Received. Keep following the Medical Checklist and record vitals every 5 minutes. Send an update with new vitals and anything that changed. We are standing by.',
  log: 'Log received, thank you. The medical team will review it and follow up at the next scheduled call.',
}

export const replyFor = (m: Pick<OutboxMessage, 'text'>) =>
  isEmergency(m) ? SIMULATED_REPLY.emergency : isLog(m) ? SIMULATED_REPLY.log : SIMULATED_REPLY.summary

/** First line worth showing in a list: skips blank lines and SBAR headings ("S — Situation"). */
export const headlineOf = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !/^[SBAR] — /.test(l)) ?? 'Message'
