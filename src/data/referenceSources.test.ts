import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ReferenceSource } from './types'

const rows: ReferenceSource[] = JSON.parse(readFileSync('public/data/reference_source.json', 'utf-8'))
const real = rows.filter((r) => r.id !== 'design_rule')

describe('reference_source.json (APA 7 citations shown on the Sources page)', () => {
  it('has a citation on every row', () => {
    for (const r of rows) expect(r.citation, r.id).toBeTruthy()
  })
  it('keeps *italic* markers balanced, so the page never shows stray asterisks', () => {
    for (const r of rows) expect((r.citation.match(/\*/g) ?? []).length % 2, r.id).toBe(0)
  })
  it('gives every real source a clickable link and a year in the citation', () => {
    for (const r of real) {
      expect(r.link_or_doi, r.id).toMatch(/^https:\/\/\S+$/)
      expect(r.citation, r.id).toMatch(/\((\d{4}|n\.d\.)\)\./)
    }
  })
  it('uses full https://doi.org/ links for journal articles, never a bare "DOI to be confirmed"', () => {
    for (const r of real) expect(JSON.stringify(r), r.id).not.toMatch(/to be confirmed|to be verified/i)
  })
})
