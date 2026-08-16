import { describe, expect, it } from 'vitest'
import { spokenToDigits } from './hebrewDigits'

describe('spokenToDigits', () => {
  it('keeps numerals as-is', () => {
    expect(spokenToDigits('305871234')).toBe('305871234')
    expect(spokenToDigits('30 58 712')).toBe('3058712')
  })
  it('maps single Hebrew digit words, both genders', () => {
    expect(spokenToDigits('אפס חמש שבע')).toBe('057')
    expect(spokenToDigits('אחד שתיים שלושה ארבע')).toBe('1234')
  })
  it('handles a mix of words and numerals with punctuation', () => {
    expect(spokenToDigits('אפס, 54 שבע.')).toBe('0547')
  })
  it('strips a leading vav on a digit word', () => {
    expect(spokenToDigits('שש ושבע')).toBe('67')
  })
  it('drops words that are not digits', () => {
    expect(spokenToDigits('תעודת זהות חמש')).toBe('5')
    expect(spokenToDigits('בלה בלה')).toBe('')
  })
})
