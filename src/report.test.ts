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
  photo_count: 2,
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

describe('progress-report + missing-material rendering', () => {
  const tables = {
    progress_table: JSON.stringify([
      { task: 'End set rear', pct: 80, remarks: 'Missing material BD' },
      { task: 'System', pct: 100, remarks: '' },
    ]),
    progress_house_pct: '70',
    missing_material: JSON.stringify([
      { code: '91-00-1234', desc: 'Egg belt', amount: '2', reason: '4' },
      { code: '', desc: '', amount: '', reason: '' }, // untouched row → dropped
    ]),
  }
  const e: Entry = { ...entry, values: { ...entry.values, ...tables } }
  const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry: e, defs }, 'https://logo.png')
  const text = buildReportText({ projectName: 'p', authorName: 'a', entry: e, defs })

  it('renders legacy flat keys as a single coop with total and bars in HTML', () => {
    expect(html).toContain('דו״ח התקדמות — לול 1')
    expect(html).toContain('70%')
    // email report is Hebrew: standard task names stored in English are normalized
    expect(html).toContain('סט קצה אחורי')
    expect(html).toContain('width:80%')
    expect(html).toContain('Missing material BD')
  })
  it('renders filled missing-material rows with reason text, drops untouched rows', () => {
    expect(html).toContain('חומר חסר')
    expect(html).toContain('91-00-1234')
    expect(html).toContain('Egg belt')
    expect(html).toContain('לא סופק מספיק')
    expect((html.match(/91-00-1234/g) ?? []).length).toBe(1)
  })
  it('includes both tables in the plain-text version', () => {
    expect(text).toContain('דו״ח התקדמות — לול 1 — 70%')
    expect(text).toContain('סט קצה אחורי: 80% — Missing material BD')
    expect(text).toContain('חומר חסר')
    expect(text).toContain('91-00-1234 · Egg belt · 2 · לא סופק מספיק')
  })
  it('omits both sections when the entry has no table data (old entries)', () => {
    const plain = buildReportHtml({ projectName: 'p', authorName: 'a', entry, defs }, 'https://logo.png')
    expect(plain).not.toContain('דו״ח התקדמות')
    expect(plain).not.toContain('חומר חסר')
  })
})

describe('multi-coop progress rendering', () => {
  const coops = JSON.stringify([
    { name: 'לול 1', pct: 75, rows: [{ task: 'כיסוי גג', pct: 100, remarks: '' }],
      bd: [{ task: 'מסוע ביצים', pct: 60, remarks: '' }, { task: 'מערכת', pct: 0, remarks: '' }] },
    { name: 'לול 2', pct: 25, rows: [{ task: 'חשמל ובקרה', pct: 50, remarks: 'בהמתנה' }],
      bd: [{ task: 'מערכת', pct: 0, remarks: '' }] }, // untouched BD form → omitted
  ])
  const e: Entry = { ...entry, values: { ...entry.values, progress_coops: coops } }
  const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry: e, defs }, 'https://logo.png')
  const text = buildReportText({ projectName: 'p', authorName: 'a', entry: e, defs })

  it('renders one section per coop in HTML', () => {
    expect(html).toContain('דו״ח התקדמות — לול 1')
    expect(html).toContain('דו״ח התקדמות — לול 2')
    expect(html).toContain('כיסוי גג')
    expect(html).toContain('חשמל ובקרה')
    expect(html).toContain('width:50%')
  })
  it('renders the BD sub-form only for coops where it was touched', () => {
    expect(html).toContain('ציוד BD — לול 1')
    expect(html).toContain('מסוע ביצים')
    expect(html).not.toContain('ציוד BD — לול 2')
  })
  it('renders one block per coop in plain text, totals computed from the tasks', () => {
    // (100 + 60 + 0) / 3 — the stored hand-typed 75 is ignored
    expect(text).toContain('דו״ח התקדמות — לול 1 — 53%')
    // untouched BD stays out of the pool: 50 alone, not (50+0)/2
    expect(text).toContain('דו״ח התקדמות — לול 2 — 50%')
    expect(text).toContain('חשמל ובקרה: 50% — בהמתנה')
    expect(text).toContain('ציוד BD:')
    expect(text).toContain('מסוע ביצים: 60%')
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

describe('crew rows + blocking flag rendering', () => {
  const mfDefs: FieldDef[] = [
    ...defs,
    { id: '4', key: 'malfunction_dept', label_he: 'מחלקת בלת"מ', label_en: 'Malfunction dept.', type: 'select', required: true, options: [], sort_order: 86, active: true },
    { id: '5', key: 'malfunction', label_he: 'בלת"מ', label_en: 'Malfunction', type: 'long_text', required: false, options: [], sort_order: 87, active: true },
  ]
  it('renders crew rows and the blocking flag, skips them when empty', () => {
    const e: Entry = {
      ...entry,
      values: {
        ...entry.values,
        crew_rows: JSON.stringify([{ contractor: 'שמחה', workers: 12, hours: 9 }]),
        malfunction_dept: 'הנדסה', malfunction: 'x', issue_blocking: 'כן',
      },
    }
    const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry: e, defs: mfDefs }, 'https://logo.png')
    expect(html).toContain('כוח אדם באתר')
    expect(html).toContain('שמחה')
    expect(html).toContain('חוסם עבודה')

    const emptyHtml = buildReportHtml({ projectName: 'p', authorName: 'a', entry, defs: mfDefs }, 'https://logo.png')
    expect(emptyHtml).not.toContain('כוח אדם באתר')
  })
})

describe('retired contractor field stays visible on entries that have it', () => {
  // field_definitions.contractor is deactivated (migration 0070) once crew_rows
  // replaced it, but months of old entries still carry values.contractor. The
  // screens pass an inactive def through to the report builder whenever the
  // entry being rendered actually has a value for it — this locks that contract in.
  const contractorDef: FieldDef = {
    id: '9', key: 'contractor', label_he: 'שם הקבלן ומספר העובדים', label_en: 'Contractor', type: 'text',
    required: false, options: [], sort_order: 70, active: false,
  }
  const withDef = [...defs, contractorDef]

  it('renders the old value when the inactive def is passed and the entry has it', () => {
    const e: Entry = { ...entry, values: { ...entry.values, contractor: 'חברת בנייה בע"מ · 5 עובדים' } }
    const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry: e, defs: withDef }, 'https://logo.png')
    expect(html).toContain('שם הקבלן ומספר העובדים')
    expect(html).toContain('חברת בנייה בע&quot;מ')
    const text = buildReportText({ projectName: 'p', authorName: 'a', entry: e, defs: withDef })
    expect(text).toContain('שם הקבלן ומספר העובדים: חברת בנייה בע"מ · 5 עובדים')
  })

  it('omits the row entirely for a new entry with no value for it', () => {
    const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry, defs: withDef }, 'https://logo.png')
    expect(html).not.toContain('שם הקבלן ומספר העובדים')
    const text = buildReportText({ projectName: 'p', authorName: 'a', entry, defs: withDef })
    expect(text).not.toContain('שם הקבלן ומספר העובדים')
  })
})

describe('safety rendering', () => {
  it('omits the safety block entirely when nothing was filled', () => {
    const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry, defs }, 'https://logo.png')
    expect(html).not.toContain('בטיחות')
    const text = buildReportText({ projectName: 'p', authorName: 'a', entry, defs })
    expect(text).not.toContain('בטיחות')
  })
  it('shows training answer without incident row when no incident recorded', () => {
    const e: Entry = { ...entry, values: { ...entry.values, safety_training: 'כן', safety_incident: '' } }
    const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry: e, defs }, 'https://logo.png')
    expect(html).toContain('הדרכת בטיחות')
    expect(html).not.toContain('תקרית בטיחות')
  })
  it('shows the incident row when an incident was recorded', () => {
    const e: Entry = { ...entry, values: { ...entry.values, safety_incident: 'נפילת פיגום ליד לול 3' } }
    const html = buildReportHtml({ projectName: 'p', authorName: 'a', entry: e, defs }, 'https://logo.png')
    expect(html).toContain('תקרית בטיחות')
    expect(html).toContain('נפילת פיגום ליד לול 3')
    const text = buildReportText({ projectName: 'p', authorName: 'a', entry: e, defs })
    expect(text).toContain('נפילת פיגום ליד לול 3')
  })
})
