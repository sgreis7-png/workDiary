import { describe, expect, it } from 'vitest'
import { SIG_H, SIG_W, captureToSig, sigIsEmpty, sigSvg, sigToPath, simplify } from './signature'

describe('simplify (RDP)', () => {
  it('collapses collinear points to the two endpoints', () => {
    const line = Array.from({ length: 50 }, (_, i) => [i * 10, 100])
    expect(simplify(line, 4)).toEqual([[0, 100], [490, 100]])
  })
  it('keeps a genuine corner', () => {
    const corner = [[0, 0], [100, 0], [100, 100]]
    expect(simplify(corner, 4)).toEqual(corner)
  })
  it('passes through 1- and 2-point inputs untouched', () => {
    expect(simplify([[5, 5]], 4)).toEqual([[5, 5]])
    expect(simplify([[5, 5], [9, 9]], 4)).toEqual([[5, 5], [9, 9]])
  })
})

describe('captureToSig', () => {
  it('normalizes canvas px into the fixed viewBox as integers', () => {
    const sig = captureToSig([[[0, 0], [300, 150]]], 300, 150)
    expect(sig).toEqual({ v: 1, strokes: [[[0, 0], [SIG_W, SIG_H]]] })
  })
  it('drops strokes with fewer than 2 points (stray taps)', () => {
    const sig = captureToSig([[[10, 10]], [[0, 0], [50, 50]]], 100, 100)
    expect(sig.strokes.length).toBe(1)
  })
  it('keeps a dense realistic scribble under 3KB of JSON', () => {
    // 8 wavy strokes of 200 points each — denser than a real signature
    const strokes = Array.from({ length: 8 }, (_, s) =>
      Array.from({ length: 200 }, (_, i) => [i * 1.5, 75 + Math.sin(i / 5 + s) * 40]))
    const sig = captureToSig(strokes, 300, 150)
    expect(JSON.stringify(sig).length).toBeLessThan(3000)
  })
})

describe('rendering', () => {
  const sig = { v: 1 as const, strokes: [[[0, 0], [10, 10]], [[20, 20], [30, 20]]] }
  it('sigIsEmpty', () => {
    expect(sigIsEmpty(null)).toBe(true)
    expect(sigIsEmpty({ v: 1, strokes: [] })).toBe(true)
    expect(sigIsEmpty(sig)).toBe(false)
  })
  it('one M-command per stroke', () => {
    expect(sigToPath(sig)).toBe('M0 0 L10 10 M20 20 L30 20')
  })
  it('sigSvg returns inline svg with the fixed viewBox, empty string for no signature', () => {
    expect(sigSvg(null)).toBe('')
    const svg = sigSvg(sig, 160)
    expect(svg).toContain(`viewBox="0 0 ${SIG_W} ${SIG_H}"`)
    expect(svg).toContain('width="160"')
    expect(svg).toContain('<path d="M0 0 L10 10 M20 20 L30 20"')
  })
})
