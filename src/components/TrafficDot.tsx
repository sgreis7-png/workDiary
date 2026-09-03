import type { Color } from '../traffic/model'

/**
 * The one glyph the whole module is built around. `na` (not measured) is a hollow ring so it
 * can never be mistaken for `gray` (no report — filled neutral disc) or `green` (fine).
 */
export function TrafficDot({ color, size = 'sm', title }: { color: Color; size?: 'sm' | 'lg'; title?: string }) {
  return <span className={`tdot tdot--${size} tdot--${color}`} title={title} aria-label={title} role="img" />
}
