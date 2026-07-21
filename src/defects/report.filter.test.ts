// Export must contain only filled content — empty rows/sections are dropped.
import { describe, expect, it } from 'vitest'
import { buildCoopReportHtml, buildCoopReportText } from './report'
import type { CoopBundle } from './api'

const emptyCoop = {
  id: 'c1', project_id: 'p1', name: 'לול 1', coop_type: null, farm_coop_count: null,
  equipment_supplier: null, has_heating: false, has_cooling_pads: false, has_tunnel_shutter: false,
  execution_manager: null, field_supervisor: null, opened_on: null, created_by: null, created_at: '',
}
const emptyBundle = {
  coop: emptyCoop, responsibilities: [], items: [], defects: [], signatures: [], concessions: [],
} as unknown as CoopBundle

describe('report skips empty content', () => {
  it('drops empty meta rows, keeps filled ones', () => {
    const html = buildCoopReportHtml(emptyBundle, 'פרויקט א')
    expect(html).toContain('פרויקט / אתר')
    expect(html).toContain('לול 1')
    expect(html).not.toContain('ספק ציוד גידול')
    expect(html).not.toContain('מנהל ביצוע')
  })
  it('keeps boolean equipment rows (false = "no" is information)', () => {
    const html = buildCoopReportHtml(emptyBundle, 'פ')
    expect(html).toContain('חימום')
  })
  it('drops the responsibility section when nothing is filled', () => {
    const html = buildCoopReportHtml(emptyBundle, 'פ')
    expect(html).not.toContain('מטריצת אחריות')
  })
  it('drops untouched gates, summary, and unsigned signature markers', () => {
    const html = buildCoopReportHtml(emptyBundle, 'פ')
    expect(html).not.toContain('ריכוז סטטוס')
    expect(html).not.toContain('— טרם —')
    expect(html).not.toContain('— טרם נחתם —')
  })
  it('keeps a gate that has an answered item, drops unanswered items in it', () => {
    const b = {
      ...emptyBundle,
      items: [{ coop_id: 'c1', gate: 'pre_pour', item_no: 1, status: 'done', severity: null, note: null, external_by: null, auto_na_reason: null }],
    } as unknown as CoopBundle
    const html = buildCoopReportHtml(b, 'פ')
    expect(html).toContain('ריכוז סטטוס')
    expect(html).not.toContain('— טרם —')
  })
  it('keeps the empty-defects message', () => {
    expect(buildCoopReportHtml(emptyBundle, 'פ')).toContain('אין ליקויים רשומים.')
  })
  it('keeps filled responsibility rows and drops empty ones', () => {
    const b = {
      ...emptyBundle,
      responsibilities: [{ coop_id: 'c1', domain_key: 'gas', responsible: 'agrotop', external_who: null, notes: null }],
    } as unknown as CoopBundle
    const html = buildCoopReportHtml(b, 'פ')
    expect(html).toContain('מטריצת אחריות')
  })
  it('text report omits gates without answers', () => {
    const txt = buildCoopReportText(emptyBundle, 'פ')
    expect(txt).not.toMatch(/טרם \d/)
  })
})
