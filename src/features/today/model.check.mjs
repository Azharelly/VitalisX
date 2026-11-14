// Self-check for the Today helpers. Run: node src/features/today/model.check.mjs
import assert from 'node:assert/strict'
import { worst, byAttention, formatValue, deviation } from './model.ts'

assert.equal(worst([]), 'none')
assert.equal(worst(['ok', 'none']), 'ok')
assert.equal(worst(['ok', 'watch', 'learn']), 'watch')
assert.equal(worst(['watch', 'alert', 'ok']), 'alert')

const r = (level, priority) => ({ level, priority })
const sorted = [r('ok', 1), r('watch', 8), r('alert', 4), r('watch', 3)].sort(byAttention)
assert.deepEqual(sorted.map((x) => `${x.level}${x.priority}`), ['alert4', 'watch3', 'watch8', 'ok1'])

assert.equal(formatValue({ value: null, decimals: 1 }), '—')
assert.equal(formatValue({ value: 38.25, decimals: 1 }), '38.3')

const t = (value, usual) => ({ value, usual, decimals: 1, unit: '°C' })
assert.equal(deviation(t(38.2, [36.8, 37.3])), '0.9 °C above your usual')
assert.equal(deviation(t(36.5, [36.8, 37.3])), '0.3 °C below your usual')
assert.equal(deviation(t(37.3, [36.8, 37.3])), null) // band edge is inside
assert.equal(deviation(t(38.2, undefined)), null)
assert.equal(deviation(t(null, [36.8, 37.3])), null)

console.log('today model: ok')

// ── Simulated backend: the dossier stories hold on mission day 142 ──
const { simulatedTodayApi: api } = await import('./simulate.ts')
const { parseTodayView } = await import('./api.ts')
const lvl = (t, id) => t.readings.find((x) => x.id === id).level
const flagged = (t) => t.readings.filter((x) => x.level === 'watch' || x.level === 'alert').map((x) => x.id).sort()

const ravi = await api.getToday('ravi')
assert.equal(ravi.missionDay, 142)
assert.equal(lvl(ravi, 'temp'), 'alert')
assert.equal(lvl(ravi, 'hr'), 'watch')
assert.equal(ravi.nextAction.metricId, 'temp')
assert.deepEqual(flagged(await api.getToday('amara')), ['sleep'])
assert.deepEqual(flagged(await api.getToday('kenji')), ['rad'])
assert.deepEqual(flagged(await api.getToday('lucia')), [])
for (const c of await api.listCrew()) assert.equal(lvl(await api.getToday(c.id, 150), 'rad'), 'alert') // storm day
assert.equal(lvl(await api.getToday('lucia', 5), 'hr'), 'learn')
await assert.rejects(api.getToday('nobody'))
await assert.rejects(api.getToday('ravi', 0))

// ── Server responses are validated before rendering ──
const wire = (v) => JSON.parse(JSON.stringify(v)) // what a server would send
assert.deepEqual(wire(parseTodayView(wire(ravi))), wire(ravi))
assert.throws(() => parseTodayView({ ...ravi, readings: [{ ...ravi.readings[0], level: 'panic' }] }))
assert.throws(() => parseTodayView({ ...ravi, person: { name: 'x'.repeat(41), role: 'r' } }))
assert.throws(() => parseTodayView(null))

console.log('today simulate + api: ok')
