import { describe, expect, it } from 'vitest'
import type { SafetyFormRec } from './model'
import { safetyFormHtml } from './report'

const form: SafetyFormRec = {
  id: 'x', project_id: 'p', training_date: '2026-08-16',
  topics: ['עבודה בגובה'],
  workers: [
    { name: 'אחמד', id_number: '123456789', signature: { v: 1, strokes: [[[0, 0], [9, 9]]] }, signed_at: '2026-08-16T06:00:00Z' },
    { name: 'יוסי', id_number: '', signature: null, signed_at: null },
  ],
  instructor_name: 'חיים', instructor_qualification: 'ממונה בטיחות',
  instructor_signature: { v: 1, strokes: [[[1, 1], [5, 5]]] },
  created_by: 'u', created_at: '', updated_at: '',
}

describe('safetyFormHtml', () => {
  const html = safetyFormHtml(form, 'לול רווחה — קיבוץ X', 'he')
  it('carries the official header, project, date and topics', () => {
    expect(html).toContain('טופס הדרכה יומי')
    expect(html).toContain('לול רווחה — קיבוץ X')
    expect(html).toContain('2026-08-16')
    expect(html).toContain('עבודה בגובה')
  })
  it('renders a worker row per worker, signature svg only where signed', () => {
    expect(html).toContain('אחמד')
    expect(html).toContain('123456789')
    expect((html.match(/<svg/g) ?? []).length).toBe(2) // one worker + instructor
  })
  it('escapes html in user-entered text', () => {
    const evil = { ...form, workers: [{ ...form.workers[0], name: '<img src=x>' }] }
    expect(safetyFormHtml(evil, 'p', 'he')).not.toContain('<img src=x>')
  })
  it('includes declarations and instructor block', () => {
    expect(html).toContain('הנני מצהיר')
    expect(html).toContain('ממונה בטיחות')
  })
})
