// A mistyped VITE_MPP_CONVERTER_URL used to beat the working default and fail at upload
// time with a network error — which reads as "the converter is down", not "this setting
// is wrong". The real case that shipped was the literal placeholder from a set-up note:
// https://<render host>/convert
import { describe, expect, it, vi } from 'vitest'
import { resolveConverterUrl } from './api'

const DEFAULT = 'https://mpp-converter-dhm3.onrender.com/convert'

describe('resolveConverterUrl', () => {
  it('falls back to the deployed converter when nothing is set', () => {
    expect(resolveConverterUrl(undefined)).toBe(DEFAULT)
    expect(resolveConverterUrl('')).toBe(DEFAULT)
    expect(resolveConverterUrl('   ')).toBe(DEFAULT)
  })

  it('honours a real override, trimming stray whitespace', () => {
    expect(resolveConverterUrl('http://localhost:8080/convert')).toBe('http://localhost:8080/convert')
    expect(resolveConverterUrl('  https://convert.example.com/convert  ')).toBe('https://convert.example.com/convert')
  })

  it.each([
    ['https://<render host>/convert', 'an unreplaced placeholder'],
    ['https://render host/convert', 'a space in the host'],
    ['<render host>', 'no scheme at all'],
    ['mpp-converter-dhm3.onrender.com/convert', 'a bare host'],
    ['ftp://converter.example.com/convert', 'the wrong scheme'],
    ['javascript:alert(1)', 'a script url'],
    ['https:///convert', 'a truncated paste, which parses as the host "convert"'],
    ['https://converter/convert', 'a dotless host'],
  ])('ignores %s (%s)', (value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveConverterUrl(value)).toBe(DEFAULT)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
