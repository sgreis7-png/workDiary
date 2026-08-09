import { useEffect, useRef, type RefObject } from 'react'

/** Things a keyboard can land on inside a dialog. */
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

const shown = (el: HTMLElement) => el.offsetParent !== null || el === document.activeElement

/** Keyboard behaviour every dialog in the app should have.
 *
 *  Closes on Escape, keeps Tab inside the panel while it is open, and hands focus back to
 *  whatever opened it. Without the last part a keyboard user who closes a dialog is dropped at
 *  the top of the document and has to tab all the way back to where they were.
 *
 *  The caller owns the ref and writes the ARIA attributes itself, so the markup says out loud
 *  that it is a dialog:
 *
 *    const panel = useRef<HTMLDivElement>(null)
 *    useDialog(panel, onClose)
 *    <div className="modal-backdrop" onClick={onClose}>
 *      <div className="modal" ref={panel} role="dialog" aria-modal="true"
 *           aria-label="שליחת דוח" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
 *
 *  `tabIndex={-1}` is what lets a dialog of pure text hold focus at all.
 *
 *  Pass `open` only for a panel rendered inline by a bigger component instead of in its own
 *  one: the hook must still run on every render there, so the flag is how it learns the panel
 *  is on screen.
 */
export function useDialog(
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
  open = true,
): void {
  // Call sites pass an inline arrow, so onClose is a new function every render. Reading it
  // through a ref keeps the effect below from re-running and re-grabbing focus mid-typing.
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const el = panel.current
    const opener = document.activeElement as HTMLElement | null

    const items = () => Array.from(el?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(shown)
    // Start inside the dialog rather than on the page behind it.
    ;(items()[0] ?? el)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab' || !el) return
      const list = items()
      if (!list.length) return
      const active = document.activeElement as HTMLElement | null
      const edge = e.shiftKey ? list[0] : list[list.length - 1]
      if (active === edge || !active || !el.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? list[list.length - 1] : list[0]).focus()
      }
    }

    // Capture, so a dialog opened from inside another keydown handler still sees Escape first.
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      opener?.focus?.()
    }
    // `panel` is a stable ref object; re-running on it would defeat the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
