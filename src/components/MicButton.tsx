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

export function MicButton({ onText, lang = 'he-IL' }: { onText: (t: string) => void; lang?: string }) {
  const [on, setOn] = useState(false)
  const ref = useRef<SpeechRec | null>(null)
  if (!Recognizer) return null

  const toggle = () => {
    if (on) { ref.current?.stop(); return }
    let sent = false
    const rec = new Recognizer()
    ref.current = rec
    rec.lang = lang
    rec.interimResults = true   // capture partials so short utterances aren't lost
    rec.continuous = false
    rec.onresult = (e) => {
      let finalText = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' '
      }
      finalText = finalText.trim()
      if (finalText && !sent) { sent = true; onText(finalText) }
    }
    rec.onend = () => setOn(false)
    rec.onerror = (e) => {
      setOn(false)
      const code = e?.error || 'unknown'
      const msg = code in ERR_HE ? ERR_HE[code] : `שגיאת זיהוי דיבור: ${code}`
      if (msg) window.alert(msg)   // 'aborted' maps to '' (user stopped) — no alert
    }
    try { rec.start(); setOn(true) }
    catch { window.alert('לא ניתן להפעיל זיהוי דיבור בדפדפן זה') }
  }

  return (
    <button type="button" className={`mic ${on ? 'mic--on' : ''}`} onClick={toggle} title="דיבור לטקסט" aria-label="voice input">
      {on ? '⏺' : '🎤'}
    </button>
  )
}
