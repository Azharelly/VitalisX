import { describe, expect, it } from 'vitest'
import { EMERGENCY_PREFIX, SIMULATED_REPLY, headlineOf, isEmergency, replyFor, tripOf } from './model'

const T0 = Date.parse('2031-06-22T12:00:00Z')
const msg = (patch: Partial<{ createdAt: string; delaySec: number | null; status: 'queued' | 'sent'; text: string }> = {}) => ({
  createdAt: new Date(T0).toISOString(),
  delaySec: 720,
  status: 'sent' as const,
  text: 'S — Situation\nAmara: sleep below usual.',
  ...patch,
})

describe('trip of a message to Earth', () => {
  it('goes on its way, arrives after one delay and gets a reply after two', () => {
    expect(tripOf(msg(), T0 + 60_000).stage).toBe('travelling')
    expect(tripOf(msg(), T0 + 720_000).stage).toBe('arrived')
    expect(tripOf(msg(), T0 + 1_439_000).stage).toBe('arrived')
    const t = tripOf(msg(), T0 + 1_440_000)
    expect(t.stage).toBe('replied')
    expect(t.arrivesAt - T0).toBe(720_000)
    expect(t.replyAt - T0).toBe(1_440_000)
  })

  it('a message still in the outbox is waiting, however old', () => {
    expect(tripOf(msg({ status: 'queued' }), T0 + 10 * 3_600_000).stage).toBe('waiting')
  })

  it('uses the mission delay when the row has none', () => {
    expect(tripOf(msg({ delaySec: null }), T0 + 100_000, 60).stage).toBe('arrived')
  })
})

describe('message kinds and text', () => {
  it('tells emergency messages from summaries and replies to each', () => {
    const e = msg({ text: `${EMERGENCY_PREFIX}Bleeding · Amara Okafor` })
    expect(isEmergency(e)).toBe(true)
    expect(isEmergency(msg())).toBe(false)
    expect(replyFor(e)).toBe(SIMULATED_REPLY.emergency)
    expect(replyFor(msg())).toBe(SIMULATED_REPLY.summary)
  })

  it('headline skips SBAR headings and blank lines', () => {
    expect(headlineOf('S — Situation\n\nAmara: sleep below usual.')).toBe('Amara: sleep below usual.')
    expect(headlineOf('')).toBe('Message')
  })
})
