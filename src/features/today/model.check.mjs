// Self-check for the Today helpers. Run: node src/features/today/model.check.mjs
import assert from 'node:assert/strict'
import { worst, byAttention, formatValue } from './model.ts'

assert.equal(worst([]), 'none')
assert.equal(worst(['ok', 'none']), 'ok')
assert.equal(worst(['ok', 'watch', 'learn']), 'watch')
assert.equal(worst(['watch', 'alert', 'ok']), 'alert')

const r = (level, priority) => ({ level, priority })
const sorted = [r('ok', 1), r('watch', 8), r('alert', 4), r('watch', 3)].sort(byAttention)
assert.deepEqual(sorted.map((x) => `${x.level}${x.priority}`), ['alert4', 'watch3', 'watch8', 'ok1'])

assert.equal(formatValue({ value: null, decimals: 1 }), '—')
assert.equal(formatValue({ value: 38.25, decimals: 1 }), '38.3')

console.log('today model: ok')
