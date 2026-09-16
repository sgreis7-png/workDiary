import { describe, expect, it } from 'vitest'
import {
  blankAttendee, handoverMatchesText, systemChecksFor, validateHandover,
  type HandoverDraft, type HandoverRec, type HandoverSystem,
} from './model'

const sig = { v: 1 as const, strokes: [[[0, 0], [9, 9]]] }

const full = (): HandoverDraft => ({
  project_id: 'p1',
  handover_date: '2026-09-16',
  client_name: 'קיבוץ מעלה גמלא',
  site_location: 'רמת הגולן',
  project_nature: 'לול פיטום',
  attendees: [{ name: 'אבי', role: 'מנהל פרויקט' }],
  systems: [{ label: 'אוורור', status: 'ok', note: '' }],
  receiver_name: 'מיכאל',
  receiver_role: 'מנהל הלול',
  receiver_signature: sig,
})

describe('validateHandover', () => {
  it('accepts a complete form', () => {
    expect(validateHandover(full())).toEqual([])
  })
  it('rejects a missing project', () => {
    expect(validateHandover({ ...full(), project_id: '' })).toContain('project')
  })
  it('rejects an incomplete header', () => {
    expect(validateHandover({ ...full(), site_location: '  ' })).toContain('header')
  })
  it('rejects a form with no complete attendee', () => {
    expect(validateHandover({ ...full(), attendees: [{ name: 'אבי', role: '' }] })).toContain('attendee')
  })
  // The whole value of the record is that every system was actually looked at. An unmarked
  // row means the paper equivalent was handed over with a blank box — which is what this
  // screen exists to stop.
  it('rejects an unmarked system', () => {
    const d = { ...full(), systems: [{ label: 'אוורור', status: null, note: '' }] }
    expect(validateHandover(d)).toContain('systems')
  })
  it('rejects a form with no systems at all', () => {
    expect(validateHandover({ ...full(), systems: [] })).toContain('systems')
  })
  it('rejects a missing receiver name, role or signature', () => {
    expect(validateHandover({ ...full(), receiver_name: '' })).toContain('receiver')
    expect(validateHandover({ ...full(), receiver_role: '' })).toContain('receiver')
    expect(validateHandover({ ...full(), receiver_signature: null })).toContain('receiver')
    expect(validateHandover({ ...full(), receiver_signature: { v: 1, strokes: [] } })).toContain('receiver')
  })
})

describe('systemChecksFor', () => {
  const cat: HandoverSystem[] = [
    { id: '1', label: 'אוורור', sort_order: 10, active: true },
    { id: '2', label: 'חימום', sort_order: 20, active: false },
  ]
  it('lists the active catalogue, unmarked, for a new form', () => {
    expect(systemChecksFor(cat, [])).toEqual([{ label: 'אוורור', status: null, note: '' }])
  })
  // A system retired after the customer signed must still appear on that form, or the
  // reopened document no longer matches the paper the customer holds.
  it('keeps a saved check whose system has since been deactivated, and its answer', () => {
    const saved = [{ label: 'חימום', status: 'bad' as const, note: 'דוד דולף' }]
    expect(systemChecksFor(cat, saved)).toEqual([
      { label: 'אוורור', status: null, note: '' },
      { label: 'חימום', status: 'bad', note: 'דוד דולף' },
    ])
  })
  it('reuses saved answers for systems still in the catalogue', () => {
    const saved = [{ label: 'אוורור', status: 'ok' as const, note: 'תקין' }]
    expect(systemChecksFor(cat, saved)).toEqual([{ label: 'אוורור', status: 'ok', note: 'תקין' }])
  })
})

describe('handoverMatchesText', () => {
  const rec = { client_name: 'מעלה גמלא', receiver_name: 'מיכאל', site_location: 'הגולן' } as HandoverRec
  it('matches client, receiver or site, and matches everything on an empty query', () => {
    expect(handoverMatchesText(rec, 'גמלא')).toBe(true)
    expect(handoverMatchesText(rec, 'מיכאל')).toBe(true)
    expect(handoverMatchesText(rec, 'הגולן')).toBe(true)
    expect(handoverMatchesText(rec, 'תל אביב')).toBe(false)
    expect(handoverMatchesText(rec, '')).toBe(true)
  })
})

describe('blankAttendee', () => {
  it('starts empty', () => {
    expect(blankAttendee()).toEqual({ name: '', role: '' })
  })
})
