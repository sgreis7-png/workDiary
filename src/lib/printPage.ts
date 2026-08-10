/**
 * Print, or save as PDF, from anywhere the app runs.
 *
 * `window.print()` is a no-op in an installed PWA — iOS ignores it in standalone display mode
 * entirely, and several Android shells do too. That is why the button worked on a desktop
 * browser and did nothing on the phone: the code was fine, the container was wrong.
 *
 * In standalone we hand the same URL to the real browser, which has a print and a
 * "save as PDF" that work. The report routes render standalone, so the opened tab is the
 * document itself and the user prints it from there.
 */

/** True when the app is running as an installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
    || window.matchMedia?.('(display-mode: fullscreen)').matches === true
    || window.matchMedia?.('(display-mode: minimal-ui)').matches === true
}

/**
 * Returns what happened, so the caller can explain it rather than leaving the user pressing a
 * button that appears to do nothing:
 *   'printed'  — the print dialog was asked for
 *   'opened'   — handed to the browser, where the user prints it
 *   'blocked'  — the browser refused the new tab (pop-up blocker)
 */
export type PrintOutcome = 'printed' | 'opened' | 'blocked'

export function printPage(url = window.location.href): PrintOutcome {
  if (!isStandalone()) {
    window.print()
    return 'printed'
  }
  // noopener would drop the reference we use to detect a blocked tab; the target is our own
  // origin, so there is nothing to protect against here.
  const tab = window.open(url, '_blank')
  return tab ? 'opened' : 'blocked'
}
