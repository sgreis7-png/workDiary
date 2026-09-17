import { describe, expect, it } from 'vitest'
import type { HandoverRec } from './model'
import { handoverFormHtml } from './report'

const rec: HandoverRec = {
  id: 'x', project_id: 'p', handover_date: '2026-09-16',
  client_name: 'קיבוץ מעלה גמלא', site_location: 'רמת הגולן', project_nature: 'לול פיטום',
  attendees: [{ name: 'אבי', role: 'מנהל פרויקט' }, { name: 'דנה', role: 'מהנדסת' }],
  systems: [
    { label: 'אוורור', status: 'ok', note: '' },
    { label: 'מערכת מים', status: 'bad', note: 'דליפה בשעון' },
  ],
  notes: 'נמסר לאחר הרצה',
  receiver_name: 'מיכאל', receiver_role: 'מנהל הלול',
  receiver_signature: { v: 1, strokes: [[[1, 1], [5, 5]]] },
  signed_at: '2026-09-16T08:00:00Z',
  created_by: 'u', created_at: '', updated_at: '',
  extra_fields: [{ label: 'מס׳ הזמנה', value: '4711' }],
}

describe('handoverFormHtml', () => {
  const html = handoverFormHtml(rec, 'מעלה גמלא — לול 3', 'he')

  it('carries the paper header: customer, site, scope and date', () => {
    expect(html).toContain('מסירת פרויקט')
    expect(html).toContain('קיבוץ מעלה גמלא')
    expect(html).toContain('רמת הגולן')
    expect(html).toContain('לול פיטום')
    expect(html).toContain('2026-09-16')
  })
  it('lists every attendee with their role', () => {
    expect(html).toContain('אבי')
    expect(html).toContain('מנהל פרויקט')
    expect(html).toContain('דנה')
  })
  // The status marks are the document: a faulty system printed as blank is the failure that
  // would send Agrotop back to the site arguing about what was signed.
  it('renders a row per system with its mark and note', () => {
    expect(html).toContain('אוורור')
    expect(html).toContain('מערכת מים')
    expect(html).toContain('דליפה בשעון')
    expect(html).toContain('תקין')
    expect(html).toContain('לא תקין')
  })
  it('carries the warranty line, the notes and one signature', () => {
    expect(html).toContain('שנת אחריות')
    expect(html).toContain('נמסר לאחר הרצה')
    expect(html).toContain('מיכאל')
    expect((html.match(/<svg/g) ?? []).length).toBe(1)
  })
  it('escapes html in user-entered text', () => {
    const evil = { ...rec, client_name: '<img src=x>' }
    expect(handoverFormHtml(evil, 'p', 'he')).not.toContain('<img src=x>')
  })
  it('renders extra header fields with their label and value', () => {
    expect(html).toContain('מס׳ הזמנה')
    expect(html).toContain('4711')
  })
  it('omits the extra-fields table when the record has none', () => {
    const bare = handoverFormHtml({ ...rec, extra_fields: [] }, 'p', 'he')
    expect(bare).not.toContain('שדות נוספים')
  })
  it('escapes an extra field label and value', () => {
    const evil = handoverFormHtml(
      { ...rec, extra_fields: [{ label: '<b>x</b>', value: '<img src=x>' }] }, 'p', 'he')
    expect(evil).not.toContain('<img src=x>')
    expect(evil).toContain('&lt;img src=x&gt;')
  })
})
