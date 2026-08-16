// Vector signatures: strokes of [x,y] integer points in a fixed viewBox. A signature
// serialized this way is ~1-3KB — small enough to live inside the form's JSONB row —
// and renders crisply as SVG on screen, in print CSS and in mail HTML.
export const SIG_W = 1000
export const SIG_H = 500

export interface Sig { v: 1; strokes: number[][][] }

function perpDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (!len) return Math.hypot(p[0] - a[0], p[1] - a[1])
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
}

/** Ramer-Douglas-Peucker: drop points closer than epsilon to the chord. */
export function simplify(pts: number[][], epsilon: number): number[][] {
  if (pts.length <= 2) return pts
  let maxD = 0, idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD <= epsilon) return [pts[0], pts[pts.length - 1]]
  return [
    ...simplify(pts.slice(0, idx + 1), epsilon).slice(0, -1),
    ...simplify(pts.slice(idx), epsilon),
  ]
}

/** Raw canvas strokes (device px) → normalized, simplified signature. */
export function captureToSig(strokes: number[][][], w: number, h: number): Sig {
  const sx = SIG_W / (w || 1), sy = SIG_H / (h || 1)
  const out = strokes
    .map((s) => simplify(s.map(([x, y]) => [Math.round(x * sx), Math.round(y * sy)]), 7))
    .filter((s) => s.length > 1)
  return { v: 1, strokes: out }
}

export function sigIsEmpty(sig: Sig | null | undefined): boolean {
  return !sig || !Array.isArray(sig.strokes) || sig.strokes.length === 0
}

// Coordinates come from a DB row and may not be trustworthy (a compromised/tampered
// row could carry strings instead of numbers). Coerce to a finite number so nothing
// but digits, '.', '-', 'M'/'L' and spaces can ever reach this string — it's interpolated
// straight into an SVG `d` attribute that's fed to dangerouslySetInnerHTML and mail bodies.
function num(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

export function sigToPath(sig: Sig): string {
  return sig.strokes
    .map((s) => 'M' + s.map(([x, y]) => `${num(x)} ${num(y)}`).join(' L'))
    .join(' ')
}

/** Inline SVG markup for a signature; '' when empty. Safe for dangerouslySetInnerHTML
 *  and mail bodies: content is only numbers produced by captureToSig. */
export function sigSvg(sig: Sig | null | undefined, width = 160): string {
  if (sigIsEmpty(sig)) return ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIG_W} ${SIG_H}" width="${width}" `
    + `height="${Math.round(width * SIG_H / SIG_W)}" aria-label="signature">`
    + `<path d="${sigToPath(sig!)}" fill="none" stroke="#1b2733" stroke-width="8" `
    + `stroke-linecap="round" stroke-linejoin="round"/></svg>`
}
