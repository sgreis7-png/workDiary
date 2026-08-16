import { useEffect, useRef, useState } from 'react'
import { hasRecognizer, startRecognition } from './MicButton'
import { spokenToDigits } from '../lib/hebrewDigits'

type Editable = HTMLInputElement | HTMLTextAreaElement

// Input types where dictation makes sense. Dates, checkboxes, files etc. are out.
const TEXT_TYPES = new Set(['text', 'search', 'tel', 'email', 'url', 'number', ''])

function eligible(el: EventTarget | null): Editable | null {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return null
  if (el.readOnly || el.disabled) return null
  if (el instanceof HTMLInputElement && !TEXT_TYPES.has(el.type)) return null
  if (el.dataset.noDictate !== undefined) return null
  // fields that already carry their own inline MicButton keep it — no double mic
  if (el.closest('.input-affix')?.querySelector('.mic')) return null
  return el
}

/** True for fields that only hold digits (ת"ז, phone): the transcript is
 *  reduced to its digits so "שלוש ארבע חמש" or "345" both land clean. */
function digitsOnly(el: Editable): boolean {
  if (el instanceof HTMLTextAreaElement) return false
  return el.type === 'number' || el.type === 'tel'
    || el.inputMode === 'numeric' || el.inputMode === 'tel' || el.inputMode === 'decimal'
}

/** Write a value the way React expects: through the native setter, then a
 *  bubbling input event, so the owning component's onChange fires. */
function setNativeValue(el: Editable, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function insertText(el: Editable, raw: string) {
  let text = raw.trim()
  if (!text) return
  if (digitsOnly(el)) text = spokenToDigits(text)
  if (!text) return
  const cur = el.value
  // insert at the caret when the field supports one; append otherwise
  let start = cur.length, end = cur.length
  try {
    if (el.selectionStart !== null && el.selectionEnd !== null) {
      start = el.selectionStart; end = el.selectionEnd
    }
  } catch { /* number inputs throw on selection access */ }
  const before = cur.slice(0, start)
  const after = cur.slice(end)
  const glueL = before && !/\s$/.test(before) && !digitsOnly(el) ? ' ' : ''
  const glueR = after && !/^\s/.test(after) && !digitsOnly(el) ? ' ' : ''
  setNativeValue(el, before + glueL + text + glueR + after)
  try {
    const caret = (before + glueL + text).length
    el.setSelectionRange(caret, caret)
  } catch { /* not supported on this input type */ }
}

/** One floating mic for the whole app: appears beside whatever free-text
 *  field has focus — every screen, every future field — and dictates into
 *  it. Fields with their own inline MicButton are skipped. */
export function GlobalDictation() {
  const [target, setTarget] = useState<Editable | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [on, setOn] = useState(false)
  const recRef = useRef<ReturnType<typeof startRecognition>>(null)
  const targetRef = useRef<Editable | null>(null)
  const onRef = useRef(false)
  targetRef.current = target
  onRef.current = on

  useEffect(() => {
    if (!hasRecognizer) return

    const place = (el: Editable) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) { setTarget(null); setPos(null); return }
      // hug the field's inline-end corner (left in RTL), vertically centered
      setPos({ top: r.top + Math.min((r.height - 30) / 2, 8), left: r.left + 6 })
    }

    const onFocusIn = (e: FocusEvent) => {
      const el = eligible(e.target)
      if (el) { setTarget(el); place(el) }
      else if (!onRef.current) { setTarget(null); setPos(null) }
    }
    const onFocusOut = () => {
      // mousedown on the mic prevents default, so focus never actually leaves
      // the field while dictating; a real blur hides the button
      setTimeout(() => {
        if (onRef.current) return
        const el = targetRef.current
        if (el && document.activeElement !== el) { setTarget(null); setPos(null) }
      }, 50)
    }
    const onMove = () => { const el = targetRef.current; if (el) place(el) }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('scroll', onMove, { capture: true, passive: true })
    window.addEventListener('resize', onMove)
    window.visualViewport?.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('scroll', onMove, { capture: true })
      window.removeEventListener('resize', onMove)
      window.visualViewport?.removeEventListener('resize', onMove)
    }
  }, [])

  if (!hasRecognizer || !target || !pos) return null

  const toggle = () => {
    if (on) { recRef.current?.stop(); return }
    const el = targetRef.current
    if (!el) return
    // digit fields listen until tapped off: nine ID digits spoken one by one
    // must not be cut at the first pause
    const rec = startRecognition(
      'he-IL',
      (t) => { const cur = targetRef.current; if (cur) insertText(cur, t) },
      () => setOn(false),
      { continuous: digitsOnly(el) },
    )
    if (rec) { recRef.current = rec; setOn(true) }
  }

  return (
    <button
      type="button"
      className={`gmic ${on ? 'gmic--on' : ''}`}
      style={{ top: pos.top, left: pos.left }}
      title="דיבור לטקסט"
      aria-label="voice input"
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => { e.preventDefault(); toggle() }}
      onClick={toggle}
    >{on ? '⏺' : '🎤'}</button>
  )
}
