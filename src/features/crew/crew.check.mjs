// Self-check for the Crew board rules. Run: node src/features/crew/crew.check.mjs
import assert from 'node:assert/strict'
import { checkNewMember, checkInText, initialsOf, summarize } from './model.ts'
import { parseCrewBoard } from './api.ts'
import { simulatedCrewApi as crew, simulatedTodayApi as today } from '../today/simulate.ts'

// ── Add-member rules ──
const names = ['Amara Okafor', 'Ravi Menon']
const ok = { name: 'Kai Lund', role: 'Scientist', sex: 'F' }
assert.deepEqual(checkNewMember(ok, names), {})
assert.ok(checkNewMember({ ...ok, name: '   ' }, names).name, 'name is required')
assert.ok(checkNewMember({ ...ok, name: 'x'.repeat(41) }, names).name, 'name max 40')
assert.deepEqual(checkNewMember({ ...ok, name: 'x'.repeat(40) }, names), {})
assert.ok(checkNewMember({ ...ok, name: 'Ravi Menon' }, names).name, 'exact duplicate refused')
assert.ok(checkNewMember({ ...ok, name: ' Ravi Menon ' }, names).name, 'duplicate after trimming refused')
assert.deepEqual(checkNewMember({ ...ok, name: 'ravi menon' }, names), {}, 'only exact duplicates are refused')
assert.deepEqual(checkNewMember({ ...ok, role: '' }, names), {}, 'role is optional')
assert.ok(checkNewMember({ ...ok, role: 'r'.repeat(31) }, names).role, 'role max 30')
assert.ok(checkNewMember({ ...ok, sex: '' }, names).sex, 'body drawing must be chosen')
assert.equal(initialsOf('Lucía  Fernández'), 'LF')
assert.equal(initialsOf('Kai'), 'K')

// ── Board on day 142: the dossier stories, with Mind private ──
const board = await crew.getBoard()
const by = (id) => board.members.find((m) => m.id === id)
assert.equal(board.members.length, 4)
assert.equal(by('ravi').status, 'alert')
assert.equal(by('kenji').status, 'watch')
assert.equal(by('amara').status, 'ok', "Amara's sleep Watch is in Mind, which is private")
assert.equal(by('amara').zones.mind, undefined, 'private zone never sent')
assert.ok(board.members.every((m) => m.attention.every((r) => r.zone !== 'mind')))
assert.equal(by('ravi').attention[0].id, 'temp', 'most urgent first')
const wire = JSON.parse(JSON.stringify(board)) // what a server would send
assert.deepEqual(JSON.parse(JSON.stringify(parseCrewBoard(wire))), wire, 'board survives the HTTP parser')
const s = summarize(board.members)
assert.equal(s.alert + s.watch + s.ok + s.learn + s.none, 4)

// A leaked private zone is dropped by the parser, not shown.
const leaky = JSON.parse(JSON.stringify(board))
leaky.members[0].zones.mind = 'watch'
assert.equal(parseCrewBoard(leaky).members[0].zones.mind, undefined)

// ── Add, then remove: removed is hidden, data is kept ──
await assert.rejects(crew.addMember({ name: 'Ravi Menon', role: '', sex: 'M' }), 'backend refuses duplicates too')
const added = await crew.addMember({ name: '  Kai Lund ', role: 'Scientist', sex: 'F' })
assert.equal(added.name, 'Kai Lund')
const kai = (await crew.getBoard()).members.find((m) => m.id === added.id)
assert.equal(kai.status, 'none', 'new member: no data yet')
assert.equal(checkInText(kai, 142), 'No check-ins yet')
assert.equal((await today.getToday(added.id)).nextAction.kind, 'learning')
assert.equal((await crew.getBoard(148)).members.find((m) => m.id === added.id).status, 'learn', 'a week later: learning their normal')

await crew.removeMember(added.id)
assert.ok(!(await crew.getBoard()).members.some((m) => m.id === added.id), 'removed member hidden from the board')
assert.ok(!(await today.listCrew()).some((m) => m.id === added.id), 'and from the crew list')
assert.equal((await today.getToday(added.id)).person.name, 'Kai Lund', 'their data is kept')
await assert.rejects(crew.removeMember(added.id), 'cannot remove twice')
assert.ok((await crew.addMember({ name: 'Kai Lund', role: '', sex: 'F' })).id !== added.id, 'name free again, new id')

console.log('crew: ok')
