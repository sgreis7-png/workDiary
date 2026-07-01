import { describe, it, expect } from 'vitest'
import { buildReportHtml, buildReportText } from './report'
import type { Entry, FieldDef } from './data'

const defs: FieldDef[] = [
  { id: '1', key: 'site_location', label_he: 'מיקום האתר', label_en: 'Site', type: 'text', required: true, options: [], sort_order: 10, active: true },
  { id: '2', key: 'daily_content', label_he: 'תוכן יומי', label_en: 'Daily', type: 'long_text', required: true, options: [], sort_order: 20, active: true },
  { id: '3', key: 'site_photos', label_he: 'תמונות', label_en: 'Photos', type: 'photo', required: true, options: [], sort_order: 30, active: true },
]
const entry: Entry = {
  id: 'e1', project_id: 'p1', created_by: 'u1', work_date: '2026-06-30',
  created_at: '', last_sent_at: null,
  values: { site_location: 'כפר יובל', daily_content: 'line1\nline2 <script>x</script>' },
  photos: ['https://x/photo1.jpg', 'https://x/photo2.jpg'],
}

describe('buildReportHtml', () => {
  const html = buildReportHtml({ projectName: 'בני נצרים', authorName: 'אלון טל', entry, defs }, 'https://logo.png')

  it('includes project, author, date, logo', () => {
    expect(html).toContain('בני נצרים')
    expect(html).toContain('אלון טל')
    expect(html).toContain('2026-06-30')
    expect(html).toContain('https://logo.png')
  })
  it('renders only filled, non-photo fields with newlines as <br>', () => {
    expect(html).toContain('מיקום האתר')
    expect(html).toContain('כפר יובל')
    expect(html).toContain('line1<br>line2')
    expect(html).not.toContain('תמונות מהשטח (0)')
  })
  it('renders each photo as a full-size image', () => {
    expect(html).toContain('photo1.jpg')
    expect(html).toContain('photo2.jpg')
    expect(html).toContain('תמונות מהשטח (2)')
  })
  it('escapes HTML to prevent injection', () => {
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('buildReportText', () => {
  it('is plain text with the key fields', () => {
    const text = buildReportText({ projectName: 'בני נצרים', authorName: 'אלון טל', entry, defs })
    expect(text).toContain('בני נצרים')
    expect(text).toContain('כפר יובל')
  })
})

describe('malfunction rendering', () => {
  const mfDefs: FieldDef[] = [
    ...defs,
    { id: '4', key: 'malfunction_dept', label_he: 'מחלקת בלת"מ', label_en: 'Malfunction dept.', type: 'select', required: true, options: [], sort_order: 86, active: true },
    { id: '5', key: 'malfunction', label_he: 'בלת"מ', label_en: 'Malfunction', type: 'long_text', required: false, options: [], sort_order: 87, active: true },
  ]
  it('hides both malfunction fields when dept is none', () => {
    const e: Entry = { ...entry, values: { ...entry.values, malfunction_dept: 'אין', malfunction: 'טקסט שצריך להיעלם' } }
    const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry: e, defs: mfDefs }, 'https://logo.png')
    // label contains a literal `"`, which buildReportHtml's esc() renders as &quot;
    expect(html).not.toContain('מחלקת בלת&quot;מ')
    expect(html).not.toContain('טקסט שצריך להיעלם')
  })
  it('shows malfunction block when a real dept is set', () => {
    const e: Entry = { ...entry, values: { ...entry.values, malfunction_dept: 'הנדסה', malfunction: 'צינור נשבר' } }
    const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry: e, defs: mfDefs }, 'https://logo.png')
    expect(html).toContain('מחלקת בלת&quot;מ')
    expect(html).toContain('צינור נשבר')
  })
  it('buildReportText hides malfunction fields when dept is none, shows them for a real dept', () => {
    const noneEntry: Entry = { ...entry, values: { ...entry.values, malfunction_dept: 'אין', malfunction: 'טקסט שצריך להיעלם' } }
    const noneText = buildReportText({ projectName: 'p', authorName: 'a', entry: noneEntry, defs: mfDefs })
    expect(noneText).not.toContain('טקסט שצריך להיעלם')
    expect(noneText).not.toContain('מחלקת בלת"מ')

    const realEntry: Entry = { ...entry, values: { ...entry.values, malfunction_dept: 'הנדסה', malfunction: 'צינור נשבר' } }
    const realText = buildReportText({ projectName: 'p', authorName: 'a', entry: realEntry, defs: mfDefs })
    expect(realText).toContain('צינור נשבר')
    expect(realText).toContain('מחלקת בלת"מ')
  })
})
