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
assert.deepEqual(ravi.nextAction, { kind: 'metric', metricId: 'temp' })
assert.equal(ravi.week.length, 7)
assert.equal(ravi.week.at(-1).day, 142)
assert.equal(ravi.week.at(-1).zones.immune, 'alert')
assert.ok(ravi.checkIn.doneAt && ravi.checkIn.streakDays >= 1)
assert.deepEqual((await api.getToday('lucia')).nextAction, { kind: 'all-clear' })
assert.equal((await api.getToday('lucia', 5)).nextAction.kind, 'learning')

// Every metric the backend can return has guidance, so the UI never shows an empty step.
const { GUIDANCE, actionFor } = await import('../../data/guidance.ts')
for (const r of ravi.readings) assert.ok(GUIDANCE[r.id], `missing GUIDANCE['${r.id}']`)
for (const [id, g] of Object.entries(GUIDANCE)) {
  assert.ok(g.act.length <= 120 && g.helps.length && g.measure.length && g.sources.length && g.tell && g.why, `incomplete GUIDANCE['${id}']`)
}
assert.equal(actionFor('rad', 'alert'), GUIDANCE.rad.actAlert)
assert.equal(actionFor('rad', 'watch'), GUIDANCE.rad.act)
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
assert.throws(() => parseTodayView({ ...ravi, nextAction: { kind: 'panic' } }))
assert.throws(() => parseTodayView({ ...ravi, week: [{ day: 1, zones: { mind: 'ok' } }] }))

console.log('today simulate + api: ok')

// ── Report: week / month in review ──
const { parseReportView } = await import('./api.ts')
const { changeText } = await import('./model.ts')
const week = await api.getReport('ravi', { days: 7 })
assert.equal(week.days, 7)
assert.equal(week.zones.length, 7)
assert.equal(week.radiation.daily.length, 7)
for (const m of week.metrics) assert.equal(m.points.length, 7)
assert.ok(!week.metrics.some((m) => m.id === 'rad'), 'radiation has its own section')
assert.equal(week.metrics.find((m) => m.id === 'temp').points.at(-1).level, 'alert')
assert.ok(week.events.some((e) => e.metricId === 'temp' && e.to === 'alert'))
const month = await api.getReport('kenji', { days: 28 })
assert.equal(month.zones.length, 28)
assert.ok(month.radiation.daily.some((d) => d.storm), 'day-115 storm falls inside the month')
await assert.rejects(api.getReport('ravi', { days: 10 }))
assert.deepEqual(wire(parseReportView(wire(month))), wire(month))
assert.throws(() => parseReportView({ ...week, events: [{ day: 1, metricId: 'x', label: 'x', from: 'ok', to: 'panic' }] }))
const m0 = { avg: 6.5, prevAvg: 6.5, decimals: 1, unit: 'h' }
assert.equal(changeText(m0, 'week'), 'Steady vs previous week')
assert.equal(changeText({ ...m0, avg: 7.0 }, 'week'), 'Up 0.5 h vs previous week')
assert.equal(changeText({ ...m0, prevAvg: null }, 'week'), null)
console.log('report: ok')
