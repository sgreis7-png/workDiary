import { useEffect, useState } from 'react'

/**
 * Live answer to a media query, so behaviour can follow the viewport rather than only
 * reading it once at mount — a phone rotated to landscape crosses most breakpoints.
 *
 * The subscription is in the effect and the state only changes from the change event, so
 * this does not set state during an effect body.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
  )

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mql = matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
