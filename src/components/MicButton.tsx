import { useRef, useState } from 'react'

// Minimal Web Speech API shape (not in this TS lib version).
interface SpeechResult extends ArrayLike<{ transcript: string }> { isFinal: boolean }
interface SpeechRec {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: (e: { results: ArrayLike<SpeechResult> }) => void
  onend: () => void
  onerror: (e: { error?: string }) => void
}
type WinSR = Window & { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }
const Recognizer = (window as WinSR).SpeechRecognition || (window as WinSR).webkitSpeechRecognition

// Human-readable Hebrew messages for the Web Speech API error codes, so a failed
// dictation tells the user WHY instead of silently doing nothing.
const ERR_HE: Record<string, string> = {
  'not-allowed': 'אין הרשאת מיקרופון — אפשר גישה למיקרופון בהגדרות הדפדפן ונסה שוב',
  'service-not-allowed': 'אין הרשאת מיקרופון — אפשר גישה בהגדרות הדפדפן',
  'no-speech': 'לא זוהה דיבור — דבר קרוב יותר למיקרופון ונסה שוב',
  'audio-capture': 'לא נמצא מיקרופון במכשיר',
  'network': 'שגיאת רשת בזיהוי הדיבור — בדוק את החיבור לאינטרנט',
  'aborted': '',
  'language-not-supported': 'השפה אינה נתמכת בדפדפן זה',
}

export const hasRecognizer = Boolean(Recognizer)

/** Start one dictation. Returns the recognizer (call .stop() to end early) or
 *  null when unsupported/failed to start. onText fires once, when the session
 *  ends, with everything said; onEnd always fires when the session is over.
 *  continuous keeps listening across pauses (until .stop()) — right for
 *  digit-by-digit dictation like an ID number. */
export function startRecognition(
  lang: string, onText: (t: string) => void, onEnd: () => void, opts?: { continuous?: boolean },
): SpeechRec | null {
  if (!Recognizer) return null
  let sent = false
  const rec = new Recognizer()
  rec.lang = lang
  rec.interimResults = true   // capture partials so short utterances aren't lost
  rec.continuous = opts?.continuous ?? false
  const flush = (e?: { results: ArrayLike<SpeechResult> }) => {
    if (sent) return
    // Session is over — take every segment, final or not. On Android Chrome a
    // continuous session stopped by hand often still holds its last segment as
    // interim; dropping it loses exactly what was said.
    let text = ''
    if (e) {
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + ' '
    }
    text = text.trim()
    if (text) { sent = true; onText(text) }
  }
  let last: { results: ArrayLike<SpeechResult> } | undefined
  rec.onresult = (e) => { last = e }
  rec.onend = () => { flush(last); onEnd() }
  rec.onerror = (e) => {
    // a no-speech timeout after some digits were already heard is not a failure
    flush(last)
    onEnd()
    const code = e?.error || 'unknown'
    if (sent && (code === 'no-speech' || code === 'aborted')) return
    const msg = code in ERR_HE ? ERR_HE[code] : `שגיאת זיהוי דיבור: ${code}`
    if (msg) window.alert(msg)   // 'aborted' maps to '' (user stopped) — no alert
  }
  try { rec.start(); return rec }
  catch { window.alert('לא ניתן להפעיל זיהוי דיבור בדפדפן זה'); return null }
}

export function MicButton({ onText, lang = 'he-IL' }: { onText: (t: string) => void; lang?: string }) {
  const [on, setOn] = useState(false)
  const ref = useRef<SpeechRec | null>(null)
  if (!Recognizer) return null

  const toggle = () => {
    if (on) { ref.current?.stop(); return }
    const rec = startRecognition(lang, onText, () => setOn(false))
    if (rec) { ref.current = rec; setOn(true) }
  }

  return (
    <button type="button" className={`mic ${on ? 'mic--on' : ''}`} onClick={toggle} title="דיבור לטקסט" aria-label="voice input">
      {on ? '⏺' : '🎤'}
    </button>
  )
}
