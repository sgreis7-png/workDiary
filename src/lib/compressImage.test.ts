// Node has no canvas, so the compression path itself can't run here — but the
// contract that matters is the one that loses photos if it's wrong: anything
// the compressor can't or shouldn't handle must come back unchanged.
import { describe, it, expect } from 'vitest'
import { compressImage, compressImages } from './compressImage'

const mkFile = (name: string, type: string, bytes: number) =>
  new File([new Uint8Array(bytes)], name, { type })

describe('compressImage fallback contract', () => {
  it('passes non-images through untouched', async () => {
    const f = mkFile('doc.pdf', 'application/pdf', 800_000)
    expect(await compressImage(f)).toBe(f)
  })
  it('passes GIFs through (canvas would drop the animation)', async () => {
    const f = mkFile('anim.gif', 'image/gif', 800_000)
    expect(await compressImage(f)).toBe(f)
  })
  it('skips images already under the size threshold', async () => {
    const f = mkFile('small.jpg', 'image/jpeg', 100_000)
    expect(await compressImage(f)).toBe(f)
  })
  it('returns the original when decoding fails (e.g. HEIC, corrupt file)', async () => {
    // large "image" of zero bytes — createImageBitmap rejects, and in node it
    // does not exist at all; either way the original must come back
    const f = mkFile('photo.heic', 'image/heic', 5_000_000)
    expect(await compressImage(f)).toBe(f)
  })
  it('compressImages preserves order and count', async () => {
    const a = mkFile('a.pdf', 'application/pdf', 1)
    const b = mkFile('b.gif', 'image/gif', 1)
    expect(await compressImages([a, b])).toEqual([a, b])
  })
})
