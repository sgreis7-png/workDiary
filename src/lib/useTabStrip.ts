import { useCallback, type KeyboardEvent, type RefObject } from 'react'

/** Arrow-key navigation for a `role="tablist"`.
 *
 *  A tab strip that only responds to clicks is unreachable by keyboard past the first tab,
 *  because the pattern gives the whole strip a single tab stop. Left/Right move between tabs,
 *  Home/End jump to the ends, and selection follows focus — which is how these strips already
 *  behave on click.
 *
 *  The caller owns the ref:
 *
 *    const tabs = useRef<HTMLDivElement>(null)
 *    const onTabKey = useTabStrip(tabs)
 *    <div className="coop-tabs" role="tablist" ref={tabs} onKeyDown={onTabKey}>
 *
 *  Pair it with `tabIndex={selected ? 0 : -1}` on each tab so the strip really is one stop.
 */
export function useTabStrip(strip: RefObject<HTMLElement | null>) {
  return useCallback((e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    const el = strip.current
    if (!el) return

    // A strip rendered without role="tab" children — the control centre drops the roles in
    // one-page mode — is not a tab strip at that moment, so arrows keep their normal meaning.
    const tabs = Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]'))
    const at = tabs.indexOf(document.activeElement as HTMLElement)
    if (tabs.length < 2 || at < 0) return

    // Left and Right mean the tab to the left and right *on screen*, so they swap in RTL —
    // which is the app's normal direction.
    const rtl = getComputedStyle(el).direction === 'rtl'
    const step = e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'ArrowRight' ? (rtl ? -1 : 1) : 0
    const to = e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : (at + step + tabs.length) % tabs.length

    e.preventDefault()
    tabs[to].focus()
    tabs[to].click()
  }, [strip])
}
