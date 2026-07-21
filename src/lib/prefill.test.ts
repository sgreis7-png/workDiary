import { describe, expect, it } from 'vitest'
import { applyPrefill } from './prefill'

describe('applyPrefill', () => {
  it('fills empty manager_name/phone', () => {
    expect(applyPrefill({}, { name: 'חיים', phone: '050' }))
      .toEqual({ manager_name: 'חיים', phone: '050' })
  })
  it('never overwrites user-typed values', () => {
    expect(applyPrefill({ manager_name: 'א', phone: '' }, { name: 'ב', phone: '1' }))
      .toEqual({ manager_name: 'א', phone: '1' })
  })
  it('ignores null prefill', () => {
    expect(applyPrefill({ x: '1' }, null)).toEqual({ x: '1' })
  })
  it('skips null fields in prefill', () => {
    expect(applyPrefill({}, { name: null, phone: '2' })).toEqual({ phone: '2' })
  })
})
