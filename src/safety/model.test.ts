import { describe, expect, it } from 'vitest'
import { dedupeWorkers, formMatchesWorker, type SafetyFormRec, type SafetyWorker } from './model'

const w = (name: string, id_number = ''): SafetyWorker =>
  ({ name, id_number, signature: null, signed_at: null })

describe('dedupeWorkers', () => {
  it('keeps first (latest-form) occurrence, dedupes by id_number when present, else by name', () => {
    const forms = [
      { workers: [w('אחמד', '123'), w('יוסי')] },        // latest form
      { workers: [w('אחמד כהן', '123'), w('יוסי'), w('דני', '9')] },
    ]
    expect(dedupeWorkers(forms)).toEqual([
      { name: 'אחמד', id_number: '123' },
      { name: 'יוסי', id_number: '' },
      { name: 'דני', id_number: '9' },
    ])
  })
  it('skips blank names', () => {
    expect(dedupeWorkers([{ workers: [w(''), w('  ')] }])).toEqual([])
  })
})

describe('formMatchesWorker', () => {
  const f = { workers: [w('מוחמד עלי', '305...')] } as unknown as SafetyFormRec
  it('matches by name substring, case-insensitively for latin', () => {
    expect(formMatchesWorker(f, 'עלי')).toBe(true)
    expect(formMatchesWorker(f, 'שרה')).toBe(false)
  })
  it('matches by id_number substring', () => {
    expect(formMatchesWorker(f, '305')).toBe(true)
  })
  it('empty query matches everything', () => {
    expect(formMatchesWorker(f, '')).toBe(true)
  })
})
