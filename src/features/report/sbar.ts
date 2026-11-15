// F-07: builds an SBAR (Situation, Background, Assessment, Recommendation) draft from a ReportView.
// Numbers, states and labels only: no medical advice is generated. The crew member edits every field before it is queued.
import { LEVEL_WORD, changeText, type ReportView } from '../today/model.ts'
import { openItems, percentOf, radiationLevel } from './summary.ts'

export interface Sbar {
  situation: string
  background: string
  assessment: string
  recommendation: string
}

export const SBAR_FIELDS = [
  { key: 'situation', letter: 'S', title: 'Situation', hint: 'Who, when, and why you are writing.' },
  { key: 'background', letter: 'B', title: 'Background', hint: 'What led up to it.' },
  { key: 'assessment', letter: 'A', title: 'Assessment', hint: 'What the readings show now.' },
  { key: 'recommendation', letter: 'R', title: 'Recommendation', hint: 'What you are asking Earth for.' },
] as const satisfies readonly { key: keyof Sbar; letter: string; title: string; hint: string }[]

const MAX_EVENTS = 6

export function draftSbar(report: ReportView): Sbar {
  const period = report.days === 7 ? 'week' : 'month'
  const first = report.zones[0]?.day ?? report.missionDay
  const span = report.missionDay - first + 1
  const rad = report.radiation
  const radPct = percentOf(rad.careerMsv, rad.limitMsv)
  const open = openItems(report)

  const situation = `${report.person.name} (${report.person.role}), mission day ${report.missionDay}. ${period === 'week' ? 'Weekly' : 'Monthly'} health summary for days ${first}–${report.missionDay}. ${
    open.length ? `${open.length} open ${open.length === 1 ? 'item' : 'items'}: ${open.map((o) => `${o.label} (${LEVEL_WORD[o.level]})`).join(', ')}.` : 'No open Watch or Alert items.'
  }`

  const events = report.events
  const shown = events.slice(-MAX_EVENTS)
  const background = [
    `${report.logged} of ${span} days logged${report.streakDays > 1 ? `; ${report.streakDays}-day check-in streak` : ''}.`,
    shown.length
      ? `Status changes: ${events.length > shown.length ? `latest ${shown.length} of ${events.length}: ` : ''}${shown.map((e) => `day ${e.day} ${e.label} ${LEVEL_WORD[e.from]} → ${LEVEL_WORD[e.to]}`).join('; ')}.`
      : `No status changes this ${period}.`,
  ].join(' ')

  const lines = report.metrics
    .filter((m) => open.some((o) => o.id === m.id))
    .sort((a, b) => open.findIndex((o) => o.id === a.id) - open.findIndex((o) => o.id === b.id))
    .map((m) => {
      const last = m.points.findLast((p) => p.value !== null)?.value ?? null
      const change = changeText(m, period)
      const latest = last === null ? '' : `, latest ${last.toFixed(m.decimals)} ${m.unit}`
      const avg = m.avg === null ? '' : `, ${period} average ${m.avg.toFixed(m.decimals)} ${m.unit}`
      return `${m.label}: ${LEVEL_WORD[m.level]}${latest}${avg}${change ? ` (${change.toLowerCase()})` : ''}.`
    })
  const radLine = rad.noData ? 'Radiation: no dose data recorded yet.' : `Radiation: ${rad.careerMsv} mSv career (${radPct}% of ${rad.limitMsv} mSv), status ${LEVEL_WORD[radiationLevel(rad)]}${
    rad.projectedMsv !== null ? `; ${rad.projectedMsv} mSv projected at arrival (${percentOf(rad.projectedMsv, rad.limitMsv)}%)` : ''
  }.`
  const assessment = [...lines, radLine].join('\n')

  const recommendation = open.length
    ? `Requesting flight surgeon review of: ${open.map((o) => o.label).join(', ')}.`
    : 'No action requested. Routine report for the record.'

  return { situation, background, assessment, recommendation }
}

/** The final plain-text message that is queued and sent. Empty sections are skipped. */
export function sbarToText(s: Sbar): string {
  return SBAR_FIELDS.map((f) => ({ f, v: s[f.key].trim() }))
    .filter((x) => x.v)
    .map((x) => `${x.f.letter} — ${x.f.title}\n${x.v}`)
    .join('\n\n')
}

/** A message needs at least a situation; the rest may be empty, but a blank message is never queued. */
export const isSendable = (s: Sbar) => s.situation.trim().length > 0
